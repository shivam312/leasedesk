// The monthly billing run (docs/BILLING_RULES.md section 7): a draft invoice
// for every lease with something to bill in the run's month. Running it again
// replaces that month's drafts, so lease changes flow through; sent invoices
// are never touched. The money comes from the pure engine (draftInvoice).

import { eq, gte, inArray, lte, ne } from "drizzle-orm";
import {
  addMonthsToMonth,
  endOfMonth,
  startOfMonth,
  type YearMonth,
} from "@/lib/billing/dates";
import { draftInvoice, type DraftInvoice } from "@/lib/billing/draft-invoice";
import { supplyType, type SupplyType } from "@/lib/billing/gst";
import type { TenantTds } from "@/lib/billing/tds";
import { deleteLogged, insertLogged } from "@/lib/db/activity-log";
import {
  billingEntities,
  buildings,
  customEscalations,
  escalationRules,
  invoiceLines,
  invoices,
  leaseCharges,
  leases,
  leaseUnits,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { savedLeaseInput } from "@/lib/leases/rows";
import { billingSettings } from "@/lib/settings/billing";
import { invoiceRow, lineRows } from "./draft-rows";
import { loadSettings } from "@/lib/settings/store";

export type RunProblem = {
  leaseId: string;
  tenantName: string;
  message: string;
};

export type RunResult = {
  runMonth: YearMonth;
  /** Drafts made in this run (including ones that replaced an older draft). */
  drafted: number;
  /**
   * Leases already sent an invoice for this month (including one credited in
   * full), left as they were.
   */
  alreadySent: number;
  /** Leases with nothing to bill this month. */
  nothingToBill: number;
  problems: RunProblem[];
};

/** The tenant's TDS columns in the engine's shape. */
export function tenantTds(t: typeof tenants.$inferSelect): TenantTds {
  return {
    rent: { deductsTds: t.deductsTdsRent, tdsRateBp: t.tdsRateBpRent },
    cam: { deductsTds: t.deductsTdsCam, tdsRateBp: t.tdsRateBpCam },
    parking: { deductsTds: t.deductsTdsParking, tdsRateBp: t.tdsRateBpParking },
    other: { deductsTds: t.deductsTdsOther, tdsRateBp: t.tdsRateBpOther },
  };
}

// An arrears quarter is billed in the first run after it ends, or after the
// lease ends (section 7). Reaching back four months is more than needed, so
// a lease that ended recently is never missed; the engine decides what bills.
const ARREARS_REACH_MONTHS = 4;

/** Every saved lease that could bill something in `runMonth`. */
async function billableLeases(
  s: Scoped,
  runMonth: YearMonth,
  leaseId?: string,
) {
  return s.tx
    .select({
      lease: leases,
      tenant: tenants,
      building: buildings,
      entity: billingEntities,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(buildings, eq(buildings.id, leases.buildingId))
    .innerJoin(
      billingEntities,
      eq(billingEntities.id, buildings.billingEntityId),
    )
    .where(
      s.where(
        leases,
        ne(leases.status, "draft"),
        lte(leases.startDate, endOfMonth(runMonth)),
        gte(
          leases.endDate,
          startOfMonth(addMonthsToMonth(runMonth, -ARREARS_REACH_MONTHS)),
        ),
        leaseId ? eq(leases.id, leaseId) : undefined,
      ),
    );
}

async function leaseTerms(s: Scoped, ids: string[]) {
  if (ids.length === 0)
    return { units: [], charges: [], rules: [], customs: [] };
  const [units, charges, rules, customs] = await Promise.all([
    s.tx
      .select()
      .from(leaseUnits)
      .where(s.where(leaseUnits, inArray(leaseUnits.leaseId, ids))),
    s.tx
      .select()
      .from(leaseCharges)
      .where(s.where(leaseCharges, inArray(leaseCharges.leaseId, ids)))
      .orderBy(leaseCharges.createdAt, leaseCharges.id),
    s.tx
      .select()
      .from(escalationRules)
      .where(s.where(escalationRules, inArray(escalationRules.leaseId, ids))),
    s.tx
      .select()
      .from(customEscalations)
      .where(
        s.where(customEscalations, inArray(customEscalations.leaseId, ids)),
      ),
  ]);
  return { units, charges, rules, customs };
}

/**
 * Leases already billed for the month: their invoice is past draft. An
 * invoice credited in full (`cancelled`) counts too, so making the month
 * again never bills a waived month a second time.
 */
export function billedLeaseIds(
  month: readonly { leaseId: string; status: string }[],
): Set<string> {
  return new Set(
    month.filter((i) => i.status !== "draft").map((i) => i.leaseId),
  );
}

type LeaseRow = Awaited<ReturnType<typeof billableLeases>>[number];
type Terms = Awaited<ReturnType<typeof leaseTerms>>;

/**
 * One lease's draft for `runMonth` from its saved terms and resolved
 * settings: `draft` is null when there is nothing to bill.
 */
async function workOutDraft(
  s: Scoped,
  { lease, tenant, building, entity }: LeaseRow,
  terms: Terms,
  runMonth: YearMonth,
): Promise<
  | { kind: "draft"; draft: DraftInvoice | null; supply: SupplyType }
  | { kind: "problem"; message: string }
> {
  if (!entity.gstin)
    return {
      kind: "problem",
      message: `Add the GSTIN for ${entity.legalName} in Settings → Business details, then make the invoices again.`,
    };
  const input = savedLeaseInput(
    lease,
    terms.units.filter((u) => u.leaseId === lease.id),
    terms.charges.filter((c) => c.leaseId === lease.id),
    terms.rules.filter((r) => r.leaseId === lease.id),
    terms.customs.filter((c) => c.leaseId === lease.id),
  );
  try {
    const settings = billingSettings(
      await loadSettings(s, {
        billingEntityId: entity.id,
        buildingId: building.id,
        tenantId: tenant.id,
        leaseSettings: lease.settings,
      }),
    );
    const supply = supplyType({
      billingGstin: entity.gstin,
      buildingStateCode: building.stateCode,
    });
    const draft = draftInvoice({
      lease: input,
      runMonth,
      settings,
      supply,
      tds: tenantTds(tenant),
    });
    return { kind: "draft", draft, supply };
  } catch (error) {
    return {
      kind: "problem",
      message: `Couldn't work out this lease's invoice. Open the lease and check its charges and dates. (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

/**
 * What one lease bills for `runMonth` now, worked out exactly as the run
 * does; used to check a draft is still right before it's sent.
 */
export async function freshDraft(
  s: Scoped,
  leaseId: string,
  runMonth: YearMonth,
) {
  const row = (await billableLeases(s, runMonth, leaseId))[0];
  if (!row) return { kind: "draft" as const, draft: null, supply: null };
  return workOutDraft(s, row, await leaseTerms(s, [leaseId]), runMonth);
}

/**
 * How many leases would bill something in `runMonth`, or can't be billed
 * and need looking at, if its run were made now. Worked out exactly as the
 * run does, and saves nothing. Today uses it for a month with no invoices,
 * so a month where nothing bills (a quarterly lease between its quarters)
 * isn't asked for (D35).
 */
export async function leasesToBill(
  s: Scoped,
  runMonth: YearMonth,
  except: ReadonlySet<string> = new Set(),
): Promise<number> {
  const rows = (await billableLeases(s, runMonth)).filter(
    (r) => !except.has(r.lease.id),
  );
  const terms = await leaseTerms(
    s,
    rows.map((r) => r.lease.id),
  );
  let n = 0;
  for (const row of rows) {
    const worked = await workOutDraft(s, row, terms, runMonth);
    if (worked.kind === "problem" || worked.draft) n++;
  }
  return n;
}

/**
 * How many leases would bill something in `runMonth` (or need looking at)
 * but have no invoice for it at all, draft or sent: a lease added after the
 * month was made. The billing page offers "Make missing invoices" for them.
 */
export async function leasesWithoutInvoice(
  s: Scoped,
  runMonth: YearMonth,
): Promise<number> {
  const made = await s.tx
    .select({ leaseId: invoices.leaseId })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.runMonth, startOfMonth(runMonth))));
  return leasesToBill(s, runMonth, new Set(made.map((m) => m.leaseId)));
}

/** Delete one draft invoice and its lines, logged. */
export async function deleteDraft(s: Scoped, invoiceId: string) {
  const lines = await s.tx
    .select({ id: invoiceLines.id })
    .from(invoiceLines)
    .where(s.where(invoiceLines, eq(invoiceLines.invoiceId, invoiceId)));
  for (const line of lines) await deleteLogged(s, invoiceLines, line.id);
  await deleteLogged(s, invoices, invoiceId);
}

/**
 * Make the drafts for `runMonth` ("2026-11"). Leases whose invoice for the
 * month is already sent are skipped; existing drafts are replaced.
 */
export async function runBilling(
  s: Scoped,
  runMonth: YearMonth,
): Promise<RunResult> {
  const result: RunResult = {
    runMonth,
    drafted: 0,
    alreadySent: 0,
    nothingToBill: 0,
    problems: [],
  };
  // Every draft for the month goes first, whichever lease it's for: a lease
  // ended early may no longer be billable, and its old draft mustn't stay.
  const month = await s.tx
    .select({
      id: invoices.id,
      leaseId: invoices.leaseId,
      status: invoices.status,
    })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.runMonth, startOfMonth(runMonth))))
    // Locked, so an invoice being sent right now is seen as sent once that
    // commits, and never deleted as a draft (D25).
    .for("update");
  for (const draft of month.filter((i) => i.status === "draft"))
    await deleteDraft(s, draft.id);
  const sent = billedLeaseIds(month);

  const rows = await billableLeases(s, runMonth);
  const terms = await leaseTerms(
    s,
    rows.map((r) => r.lease.id),
  );

  for (const row of rows) {
    const { lease, tenant, building, entity } = row;
    if (sent.has(lease.id)) {
      result.alreadySent += 1;
      continue;
    }
    const worked = await workOutDraft(s, row, terms, runMonth);
    if (worked.kind === "problem") {
      result.problems.push({
        leaseId: lease.id,
        tenantName: tenant.companyName,
        message: worked.message,
      });
      continue;
    }
    const { draft, supply } = worked;
    if (!draft) {
      result.nothingToBill += 1;
      continue;
    }
    const invoice = await insertLogged(s, invoices, {
      tenantId: tenant.id,
      leaseId: lease.id,
      buildingId: building.id,
      billingEntityId: entity.id,
      runMonth: startOfMonth(runMonth),
      placeOfSupply: building.stateCode,
      ...invoiceRow(draft, supply),
    });
    for (const line of lineRows(draft))
      await insertLogged(s, invoiceLines, {
        invoiceId: invoice.id,
        leaseId: lease.id,
        ...line,
      });
    result.drafted += 1;
  }
  return result;
}

/** A run month's invoices (drafts, sent and credited in full), by tenant name. */
export async function invoicesForMonth(s: Scoped, runMonth: YearMonth) {
  return s.tx
    .select({
      id: invoices.id,
      status: invoices.status,
      number: invoices.number,
      tenantName: tenants.companyName,
      buildingName: buildings.name,
      leaseId: invoices.leaseId,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      grandTotal: invoices.grandTotal,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(buildings, eq(buildings.id, invoices.buildingId))
    .where(s.where(invoices, eq(invoices.runMonth, startOfMonth(runMonth))))
    .orderBy(tenants.companyName);
}
