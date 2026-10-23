// pnpm db:seed:demo: the "Sharma Estates" demo organization (plan.ts), saved
// through the same code the app uses: leases through the lease form's
// checks, invoices made by the billing run and numbered when sent, payments
// recorded with their TDS, certificates uploaded. Running it again first
// removes the old demo organization, so it always ends in the same state.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { compareDates, monthOf, type PlainDate } from "@/lib/billing/dates";
import { only } from "@/lib/db/rows";
import * as schema from "@/lib/db/schema";
import {
  runAsSystem,
  runScoped,
  type Transactional,
  type Tx,
} from "@/lib/db/scoped";
import type { FileStore } from "@/lib/files/store";
import { runBilling } from "@/lib/invoices/run";
import { draftsForMonth, issueInvoice } from "@/lib/invoices/send";
import { checkLease } from "@/lib/leases/build";
import { parseLeaseForm, type LeaseFormInput } from "@/lib/leases/draft";
import { createLease } from "@/lib/leases/queries";
import { paiseText } from "@/lib/leases/prefill";
import {
  paymentSettings,
  recordPayment,
  unpaidInvoices,
} from "@/lib/payments/payments";
import { supabaseConfig } from "@/lib/supabase/config";
import { attachCertificate } from "@/lib/tds/certificates";
import { certificateDue, type Quarter } from "@/lib/tds/tracker";
import {
  DEMO_BUILDINGS,
  DEMO_EMAIL,
  DEMO_ENTITIES,
  DEMO_ORG,
  DEMO_ORG_NAME,
  DEMO_TENANTS,
  SPOTLIGHT,
  demoLeases,
  historyMonths,
  paymentDate,
  paymentMode,
  type BuildingKey,
} from "./plan";

export type DemoResult = {
  organizationId: string;
  userId: string;
  email: string;
  password: string;
  months: string[];
  invoices: number;
  payments: number;
  unpaid: number;
  certificatesMissing: number;
};

/** A password that's easy to read out in a meeting: "sharma-" and 8 letters and digits. */
export function demoPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `sharma-${[...bytes].map((b) => chars[b % chars.length]).join("")}`;
}

/**
 * Remove the demo organization and its login. Sent invoices, payments and
 * the activity log are append-only (their triggers refuse deletes, D4), so
 * this turns triggers off for its own transaction; only ever against the
 * local database, and only rows of the organization named "Sharma Estates".
 */
export async function removeDemo(db: Transactional) {
  await db.transaction(async (tx) => {
    const orgs = await tx
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.name, DEMO_ORG_NAME));
    const ids = orgs.map((o) => o.id);
    if (ids.length > 0) {
      await tx.execute(sql`set local session_replication_role = replica`);
      const tables = await tx.execute<{ table_name: string }>(sql`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'organization_id'`);
      for (const { table_name } of tables)
        await tx.execute(
          sql`delete from ${sql.identifier(table_name)} where organization_id in ${ids}`,
        );
      await tx
        .delete(schema.organizations)
        .where(inArray(schema.organizations.id, ids));
      // Back on, so deleting the login also removes its sessions.
      await tx.execute(sql`set local session_replication_role = origin`);
    }
    await tx.execute(sql`delete from auth.users where email = ${DEMO_EMAIL}`);
  });
}

/** The demo organization from scratch, with today's date as `today`. */
export async function seedDemo(
  db: Transactional,
  today: PlainDate,
  password = demoPassword(),
): Promise<DemoResult> {
  await removeDemo(db);

  // The login, through Supabase Auth (the local stack doesn't confirm emails).
  const { url, anonKey } = supabaseConfig();
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password,
  });
  if (error || !data.user || !data.session)
    throw new Error(
      `Couldn't create the demo login: ${error?.message ?? "email confirmation is on"}`,
    );
  const userId = data.user.id;

  const { organizationId, tenantIds } = await db.transaction((tx) =>
    seedSetup(tx, userId),
  );
  const ctx = { userId, organizationId };
  const asUser = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
    runScoped(db, ctx, fn);

  // Leases, as the owner saving the lease form.
  const leases = demoLeases(today);
  const unitIds = await db.transaction((tx) =>
    unitsByBuilding(tx, organizationId),
  );
  for (const plan of leases) {
    const tenantId = tenantIds.get(plan.tenant)!;
    const { buildingId, units } = unitIds[plan.building];
    const unit = units[plan.unitIndex]!;
    const input: LeaseFormInput = {
      tenantId,
      buildingId,
      unitIds: [unit.id],
      areaBasis: plan.areaBasis,
      startDate: plan.startDate,
      endDate: plan.endDate,
      lockInEndDate: plan.lockInEndDate,
      noticePeriodMonths: "3",
      rentFree: plan.rentFreeMonths ? "months" : "none",
      rentFreeLength: plan.rentFreeMonths ? String(plan.rentFreeMonths) : "",
      deposit: paiseText(
        Math.round(
          (plan.rentRate *
            (plan.areaBasis === "carpet"
              ? unit.carpetArea
              : unit.chargeableArea) *
            plan.depositMonths) /
            100,
        ),
      ),
      charges: [
        charge("rent", "per_sqft", plan.rentRate, { waived: true }),
        charge("cam", "per_sqft", plan.camRate, { waived: false }),
        ...(plan.parkingSlots
          ? [
              charge("parking", "per_slot", plan.parkingRate, {
                waived: false,
                slots: plan.parkingSlots,
              }),
            ]
          : []),
      ],
      rules: [
        {
          percent: String(plan.escalation.percentBp / 100),
          everyMonths: String(plan.escalation.everyMonths),
          anchor: plan.rentFreeMonths ? "rent_commencement" : "lease_start",
          anchorDate: "",
          compounding: true,
        },
      ],
      settings: {},
    };
    const form = parseLeaseForm(input);
    if (!form.ok)
      throw new Error(`${plan.tenant}'s lease: ${JSON.stringify(form.errors)}`);
    const draft = form.draft;
    await asUser(async (s) => {
      const leaseId = randomUUID();
      const checked = await checkLease(s, draft, null, {
        leaseId,
        chargeIds: draft.charges.map(() => randomUUID()),
      });
      if (!checked.ok)
        throw new Error(
          `${plan.tenant}'s lease: ${JSON.stringify(checked.errors)}`,
        );
      await createLease(
        s,
        checked.built,
        {
          tenantId,
          buildingId,
          areaBasis: draft.parties.areaBasis,
          depositPaise: draft.depositPaise,
          settings: {},
          status: "active",
        },
        checked.dates,
      );
    });
    await db.transaction(async (tx) => {
      await tx
        .update(schema.units)
        .set({ status: "leased" })
        .where(eq(schema.units.id, unit.id));
    });
  }

  // Each past month: the billing run makes the drafts, the owner sends them
  // on the 1st, and tenants pay a few days later, less their TDS.
  const months = historyMonths(today);
  let invoiceCount = 0;
  let paymentCount = 0;
  for (const [m, month] of months.entries()) {
    const run = await runAsSystem(db, organizationId, (s) =>
      runBilling(s, month),
    );
    if (run.problems.length)
      throw new Error(
        `Billing ${month}: ${run.problems.map((p) => `${p.tenantName}: ${p.message}`).join("; ")}`,
      );
    const drafts = await asUser((s) => draftsForMonth(s, month));
    for (const d of drafts) {
      const [inv] = await asUser((s) =>
        s.tx
          .select({ invoiceDate: schema.invoices.invoiceDate })
          .from(schema.invoices)
          .where(s.where(schema.invoices, eq(schema.invoices.id, d.id))),
      );
      const sentAt = new Date(`${inv!.invoiceDate}T10:30:00+05:30`);
      await asUser((s) => issueInvoice(s, d.id, sentAt));
      invoiceCount++;
    }
    const monthsLeft = months.length - m;
    for (const [i, t] of DEMO_TENANTS.entries()) {
      // Unpaid: the spotlight tenants' last one, two or three months.
      if ((SPOTLIGHT.unpaid[t.name] ?? 0) >= monthsLeft) continue;
      const tenantId = tenantIds.get(t.name)!;
      const paid = await asUser(async (s) => {
        const settings = await paymentSettings(s, tenantId);
        const open = await unpaidInvoices(s, tenantId, settings);
        const invoice = open.find((o) => monthOf(o.periodStart) === month);
        if (!invoice) return false;
        await recordPayment(
          s,
          {
            tenantId,
            receivedDate: paymentDate(invoice.invoiceDate, i, today),
            amountReceivedPaise:
              invoice.outstandingPaise - invoice.expectedTdsPaise,
            tdsPaise: invoice.expectedTdsPaise,
            mode: paymentMode(i),
            reference: `${paymentMode(i).toUpperCase()}${month.replace("-", "")}${String(1000 + i * 37)}`,
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
  }

  // TDS certificates for every quarter that's past due, except three tenants'.
  // Supabase Storage as the signed-in demo owner, like the app's store.
  const bucket = supabase.storage.from("documents");
  const store: FileStore = {
    async put(path, bytes, contentType) {
      const { error } = await bucket.upload(path, bytes, { contentType });
      if (error) throw new Error(`Upload to ${path} failed: ${error.message}`);
    },
    async get() {
      return null;
    },
  };
  const quarters = await asUser((s) =>
    s.tx
      .selectDistinct({
        tenantId: schema.tdsRecords.tenantId,
        financialYear: schema.tdsRecords.financialYear,
        quarter: schema.tdsRecords.quarter,
      })
      .from(schema.tdsRecords)
      .where(s.where(schema.tdsRecords)),
  );
  const missing = new Set(
    SPOTLIGHT.missingCertificates.map((n) => tenantIds.get(n)),
  );
  let certificatesMissing = 0;
  for (const q of quarters) {
    const due = certificateDue(q.financialYear, q.quarter as Quarter);
    if (compareDates(due, today) >= 0) continue;
    if (missing.has(q.tenantId)) {
      certificatesMissing++;
      continue;
    }
    await asUser((s) =>
      attachCertificate(s, store, {
        tenantId: q.tenantId,
        financialYear: q.financialYear,
        quarter: q.quarter as Quarter,
        fileName: `Form16A-FY${q.financialYear}-Q${q.quarter}.pdf`,
        contentType: "application/pdf",
        bytes: new TextEncoder().encode(
          `%PDF-1.4\n% Demo Form 16A, FY ${q.financialYear} Q${q.quarter}\n%%EOF\n`,
        ),
      }),
    );
  }
  await supabase.auth.signOut();

  const unpaid = await asUser(
    async (s) =>
      (
        await s.tx
          .select({ id: schema.invoices.id })
          .from(schema.invoices)
          .where(
            s.where(
              schema.invoices,
              inArray(schema.invoices.status, ["sent", "part_paid", "overdue"]),
            ),
          )
      ).length,
  );
  return {
    organizationId,
    userId,
    email: DEMO_EMAIL,
    password,
    months,
    invoices: invoiceCount,
    payments: paymentCount,
    unpaid,
    certificatesMissing,
  };
}

function charge(
  type: string,
  basis: string,
  ratePaise: number,
  { waived, slots }: { waived: boolean; slots?: number },
): Record<string, string | boolean> {
  return {
    type,
    basis,
    amount: paiseText(ratePaise),
    slots: slots ? String(slots) : "",
    startDate: "",
    endDate: "",
    frequency: "monthly",
    timing: "",
    gstRate: "",
    sacCode: "",
    label: "",
    waivedDuringRentFree: waived,
  };
}

/** The organization, owner, GSTINs, bank accounts, buildings, units and tenants. */
async function seedSetup(tx: Tx, userId: string) {
  const org = only(
    await tx.insert(schema.organizations).values(DEMO_ORG).returning(),
  );
  const organizationId = org.id;
  await tx.insert(schema.memberships).values({
    organizationId,
    userId,
    email: DEMO_EMAIL,
    role: "owner",
    status: "active",
  });
  const entityIds = {} as Record<BuildingKey, string>;
  for (const key of ["tower", "arcade"] as const) {
    const e = DEMO_ENTITIES[key];
    const entity = only(
      await tx
        .insert(schema.billingEntities)
        .values({ organizationId, ...e })
        .returning(),
    );
    entityIds[key] = entity.id;
    await tx.insert(schema.bankAccounts).values({
      organizationId,
      billingEntityId: entity.id,
      bankName: e.bankName,
      accountLast4: e.bankAccountNumber.slice(-4),
    });
  }
  for (const b of DEMO_BUILDINGS) {
    const { key, floors, ...values } = b;
    const building = only(
      await tx
        .insert(schema.buildings)
        .values({
          organizationId,
          ...values,
          billingEntityId: entityIds[key],
        })
        .returning(),
    );
    for (const [sortOrder, f] of floors.entries()) {
      const floor = only(
        await tx
          .insert(schema.floors)
          .values({
            organizationId,
            buildingId: building.id,
            label: f.label,
            sortOrder,
          })
          .returning(),
      );
      await tx.insert(schema.units).values(
        f.units.map((u) => ({
          organizationId,
          buildingId: building.id,
          floorId: floor.id,
          ...u,
        })),
      );
    }
  }
  const tenantIds = new Map<string, string>();
  for (const t of DEMO_TENANTS) {
    const tds = t.deductsTds
      ? {}
      : {
          deductsTdsRent: false,
          deductsTdsCam: false,
          deductsTdsParking: false,
          deductsTdsOther: false,
        };
    const tenant = only(
      await tx
        .insert(schema.tenants)
        .values({
          organizationId,
          companyName: t.name,
          gstin: t.gstin,
          pan: t.pan,
          billingAddress: t.billingAddress,
          stateCode: t.stateCode,
          ...tds,
        })
        .returning(),
    );
    tenantIds.set(t.name, tenant.id);
    await tx.insert(schema.tenantContacts).values({
      organizationId,
      tenantId: tenant.id,
      name: t.contact.name,
      role: "billing",
      email: t.contact.email,
      phone: t.contact.phone.replace(/\s/g, ""),
      whatsapp: true,
      isPrimary: true,
    });
  }
  return { organizationId, tenantIds };
}

/** Each building's id and units, floor by floor as in the plan. */
async function unitsByBuilding(tx: Tx, organizationId: string) {
  const out = {} as Record<
    BuildingKey,
    {
      buildingId: string;
      units: { id: string; carpetArea: number; chargeableArea: number }[];
    }
  >;
  for (const b of DEMO_BUILDINGS) {
    const building = only(
      await tx
        .select({ id: schema.buildings.id })
        .from(schema.buildings)
        .where(
          and(
            eq(schema.buildings.organizationId, organizationId),
            eq(schema.buildings.name, b.name),
          ),
        ),
    );
    const rows = await tx
      .select({
        id: schema.units.id,
        code: schema.units.code,
        carpetArea: schema.units.carpetArea,
        chargeableArea: schema.units.chargeableArea,
      })
      .from(schema.units)
      .where(eq(schema.units.buildingId, building.id));
    const byCode = new Map(rows.map((r) => [r.code, r]));
    out[b.key] = {
      buildingId: building.id,
      units: b.floors.flatMap((f) => f.units.map((u) => byCode.get(u.code)!)),
    };
  }
  return out;
}
