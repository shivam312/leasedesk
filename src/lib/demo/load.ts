// pnpm db:seed:load (M10): a large organization for the load test, built
// through the app's own code like the demo (D43): 3 businesses (GSTINs),
// 3 buildings of 40 units, 120 tenants with a lease each, and 36 months of
// invoices sent and paid (the last few months unpaid for some tenants), so
// Today, the invoice list, the ledger, the reports and a billing run can be
// timed at pilot scale (docs/milestones/M10.md). Local database only.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  addDays,
  addMonths,
  monthOf,
  startOfMonth,
  type PlainDate,
  type YearMonth,
} from "@/lib/billing/dates";
import { only } from "@/lib/db/rows";
import * as schema from "@/lib/db/schema";
import { runAsSystem, runScoped, type Transactional } from "@/lib/db/scoped";
import { makeGstin } from "@/lib/india/identifiers";
import { runBilling } from "@/lib/invoices/run";
import { draftsForMonth, issueInvoice } from "@/lib/invoices/send";
import { checkLease } from "@/lib/leases/build";
import { parseLeaseForm, type LeaseFormInput } from "@/lib/leases/draft";
import { createLease } from "@/lib/leases/queries";
import {
  paymentSettings,
  recordPayment,
  unpaidInvoices,
} from "@/lib/payments/payments";
import { supabaseConfig } from "@/lib/supabase/config";
import { charge, markUnitLeased, removeSeededOrg } from "./seed";

export const LOAD_ORG_NAME = "Load Test Estates";
export const LOAD_EMAIL = "load@leasedesk-load.example";
export const LOAD_MONTHS = 36;
const TENANTS = 120;

const ENTITIES = [
  { stateCode: "27", city: "Mumbai", prefix: "LTM" },
  { stateCode: "29", city: "Bengaluru", prefix: "LTB" },
  { stateCode: "06", city: "Gurugram", prefix: "LTG" },
] as const;
const ORG_PAN = "AAACL1234L";

/** A made-up PAN for tenant `i`: 5 letters, 4 digits, 1 letter. */
function tenantPan(i: number) {
  return `AABC${String.fromCharCode(65 + (i % 26))}${String(1000 + i).padStart(4, "0")}T`;
}

export type LoadResult = {
  organizationId: string;
  userId: string;
  password: string;
  invoices: number;
  payments: number;
  seconds: number;
};

export async function seedLoad(
  db: Transactional,
  today: PlainDate,
  password: string,
  log: (line: string) => void = () => {},
): Promise<LoadResult> {
  const started = Date.now();
  await removeSeededOrg(db, LOAD_ORG_NAME, LOAD_EMAIL);
  const { url, anonKey } = supabaseConfig();
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signUp({
    email: LOAD_EMAIL,
    password,
  });
  if (error || !data.user)
    throw new Error(`Couldn't create the load login: ${error?.message}`);
  const userId = data.user.id;

  const setup = await db.transaction(async (tx) => {
    const org = only(
      await tx
        .insert(schema.organizations)
        .values({
          name: LOAD_ORG_NAME,
          legalName: "Load Test Estates LLP",
          pan: ORG_PAN,
        })
        .returning(),
    );
    await tx.insert(schema.memberships).values({
      organizationId: org.id,
      userId,
      email: LOAD_EMAIL,
      role: "owner",
      status: "active",
    });
    const buildings: { id: string; stateCode: string; unitIds: string[] }[] =
      [];
    for (const [b, e] of ENTITIES.entries()) {
      const entity = only(
        await tx
          .insert(schema.billingEntities)
          .values({
            organizationId: org.id,
            legalName: `Load Test Estates LLP (${e.city})`,
            stateCode: e.stateCode,
            gstin: makeGstin(e.stateCode, ORG_PAN),
            address: `${e.city} office`,
            bankName: "HDFC Bank",
            bankAccountName: "Load Test Estates LLP",
            bankAccountNumber: `5020000000${b}`,
            ifsc: "HDFC0000001",
          })
          .returning(),
      );
      const building = only(
        await tx
          .insert(schema.buildings)
          .values({
            organizationId: org.id,
            name: `Load Tower ${e.city}`,
            address: "Business district",
            city: e.city,
            stateCode: e.stateCode,
            billingEntityId: entity.id,
            invoicePrefix: e.prefix,
            creditNotePrefix: `${e.prefix}CN`,
          })
          .returning(),
      );
      const units = await tx
        .insert(schema.units)
        .values(
          Array.from({ length: TENANTS / ENTITIES.length }, (_, u) => ({
            organizationId: org.id,
            buildingId: building.id,
            code: String(101 + u),
            carpetArea: 80_000 + u * 1_000,
            chargeableArea: 100_000 + u * 1_250,
          })),
        )
        .returning();
      buildings.push({
        id: building.id,
        stateCode: e.stateCode,
        unitIds: units.map((u) => u.id),
      });
    }
    const tenantIds: string[] = [];
    for (let i = 0; i < TENANTS; i++) {
      const state = ENTITIES[i % ENTITIES.length]!.stateCode;
      const tenant = only(
        await tx
          .insert(schema.tenants)
          .values({
            organizationId: org.id,
            companyName: `Load Tenant ${String(i + 1).padStart(3, "0")} Pvt Ltd`,
            gstin: makeGstin(state, tenantPan(i)),
            pan: tenantPan(i),
            billingAddress: "Business district",
            stateCode: state,
          })
          .returning(),
      );
      await tx.insert(schema.tenantContacts).values({
        organizationId: org.id,
        tenantId: tenant.id,
        name: `Accounts ${i + 1}`,
        role: "billing",
        email: `accounts${i + 1}@load.example`,
        isPrimary: true,
      });
      tenantIds.push(tenant.id);
    }
    return { organizationId: org.id, buildings, tenantIds };
  });
  const { organizationId, buildings, tenantIds } = setup;
  const ctx = { userId, organizationId };
  const asUser = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
    runScoped(db, ctx, fn);

  // One five-year lease per tenant from the 1st of the first month.
  const thisMonth = monthOf(today);
  const firstMonth = addMonths(
    startOfMonth(thisMonth),
    -LOAD_MONTHS,
    "roll_forward",
  );
  const months: YearMonth[] = Array.from({ length: LOAD_MONTHS + 1 }, (_, m) =>
    monthOf(addMonths(firstMonth, m, "roll_forward")),
  );
  for (const [i, tenantId] of tenantIds.entries()) {
    const building = buildings[i % buildings.length]!;
    const unitId = building.unitIds[Math.floor(i / buildings.length)]!;
    const input: LeaseFormInput = {
      tenantId,
      buildingId: building.id,
      unitIds: [unitId],
      areaBasis: "chargeable",
      startDate: firstMonth,
      endDate: addDays(addMonths(firstMonth, 60, "roll_forward"), -1),
      lockInEndDate: "",
      noticePeriodMonths: "3",
      rentFree: "none",
      rentFreeLength: "",
      deposit: "",
      charges: [
        charge("rent", "per_sqft", 9_000 + i * 25, { waived: true }),
        charge("cam", "per_sqft", 1_500, { waived: false }),
      ],
      rules: [
        {
          percent: "5",
          everyMonths: "12",
          anchor: "lease_start",
          anchorDate: "",
          compounding: true,
        },
      ],
      settings: {},
    };
    const form = parseLeaseForm(input);
    if (!form.ok) throw new Error(`Lease ${i}: ${JSON.stringify(form.errors)}`);
    const draft = form.draft;
    await asUser(async (s) => {
      const checked = await checkLease(s, draft, null, {
        leaseId: randomUUID(),
        chargeIds: draft.charges.map(() => randomUUID()),
      });
      if (!checked.ok)
        throw new Error(`Lease ${i}: ${JSON.stringify(checked.errors)}`);
      await createLease(
        s,
        checked.built,
        {
          tenantId,
          buildingId: building.id,
          areaBasis: "chargeable",
          depositPaise: 0,
          settings: {},
          status: "active",
        },
        checked.dates,
      );
    });
    await db.transaction((tx) => markUnitLeased(tx, organizationId, unitId));
  }
  log(`Leases saved (${tenantIds.length}).`);

  // Each month: bill, send on the 1st, and most tenants pay on the 7th,
  // less TDS. Every tenth tenant hasn't paid the last three months; nobody
  // has paid this month yet.
  let invoiceCount = 0;
  let paymentCount = 0;
  for (const [m, month] of months.entries()) {
    const run = await runAsSystem(db, organizationId, (s) =>
      runBilling(s, month),
    );
    if (run.problems.length)
      throw new Error(`Billing ${month}: ${run.problems[0]!.message}`);
    const drafts = await asUser((s) => draftsForMonth(s, month));
    for (const d of drafts) {
      await asUser((s) =>
        issueInvoice(
          s,
          d.id,
          new Date(`${startOfMonth(month)}T10:30:00+05:30`),
        ),
      );
      invoiceCount++;
    }
    if (month === thisMonth) continue;
    const late = months.length - 1 - m <= 3;
    for (const [i, tenantId] of tenantIds.entries()) {
      if (late && i % 10 === 0) continue;
      const paid = await asUser(async (s) => {
        const open = await unpaidInvoices(
          s,
          tenantId,
          await paymentSettings(s, tenantId),
        );
        const invoice = open.find((o) => monthOf(o.periodStart) === month);
        if (!invoice) return false;
        await recordPayment(
          s,
          {
            tenantId,
            receivedDate: `${month}-07`,
            amountReceivedPaise:
              invoice.outstandingPaise - invoice.expectedTdsPaise,
            tdsPaise: invoice.expectedTdsPaise,
            mode: "neft",
            reference: `NEFT${month.replace("-", "")}${i}`,
            note: null,
            allocations: [
              { invoiceId: invoice.id, amountPaise: invoice.outstandingPaise },
            ],
          },
          today,
        );
        return true;
      });
      if (paid) paymentCount++;
    }
    log(`${month}: ${invoiceCount} invoices, ${paymentCount} payments so far.`);
  }
  await supabase.auth.signOut();
  return {
    organizationId,
    userId,
    password,
    invoices: invoiceCount,
    payments: paymentCount,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}
