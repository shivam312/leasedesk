// The monthly billing run (docs/BILLING_RULES.md section 7): a draft invoice
// for every lease with something to bill in the run's month. Running it again
// replaces that month's drafts, so lease changes flow through; sent invoices
// are never touched. The money comes from the pure engine (draftInvoice).

import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import {
  addMonthsToMonth,
  endOfMonth,
  startOfMonth,
  type YearMonth,
} from "@/lib/billing/dates";
import { draftInvoice } from "@/lib/billing/draft-invoice";
import { supplyType } from "@/lib/billing/gst";
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
  /** Leases already sent an invoice for this month, left as they were. */
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

// An arrears quarter is billed in the run after it ends, or after the lease
// ends: at most three months after the lease's last day.
const ARREARS_REACH_MONTHS = 4;

/** Every saved lease that could bill something in `runMonth`. */
async function billableLeases(s: Scoped, runMonth: YearMonth) {
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
    .where(
      s.where(
        invoices,
        eq(invoices.runMonth, startOfMonth(runMonth)),
        ne(invoices.status, "cancelled"),
      ),
    )
    // Locked, so an invoice being sent right now is seen as sent once that
    // commits, and never deleted as a draft (D25).
    .for("update");
  for (const draft of month.filter((i) => i.status === "draft"))
    await deleteDraft(s, draft.id);
  const sent = new Set(
    month.filter((i) => i.status !== "draft").map((i) => i.leaseId),
  );

  const rows = await billableLeases(s, runMonth);
  const terms = await leaseTerms(
    s,
    rows.map((r) => r.lease.id),
  );

  for (const { lease, tenant, building, entity } of rows) {
    if (sent.has(lease.id)) {
      result.alreadySent += 1;
      continue;
    }
    if (!entity.gstin) {
      result.problems.push({
        leaseId: lease.id,
        tenantName: tenant.companyName,
        message: `Add the GSTIN for ${entity.legalName} in Settings → Business details, then make the invoices again.`,
      });
      continue;
    }
    const input = savedLeaseInput(
      lease,
      terms.units.filter((u) => u.leaseId === lease.id),
      terms.charges.filter((c) => c.leaseId === lease.id),
      terms.rules.filter((r) => r.leaseId === lease.id),
      terms.customs.filter((c) => c.leaseId === lease.id),
    );
    let draft;
    let supply;
    try {
      const settings = billingSettings(
        await loadSettings(s, {
          billingEntityId: entity.id,
          buildingId: building.id,
          tenantId: tenant.id,
          leaseSettings: lease.settings,
        }),
      );
      supply = supplyType({
        billingGstin: entity.gstin,
        buildingStateCode: building.stateCode,
      });
      draft = draftInvoice({
        lease: input,
        runMonth,
        settings,
        supply,
        tds: tenantTds(tenant),
      });
    } catch (error) {
      result.problems.push({
        leaseId: lease.id,
        tenantName: tenant.companyName,
        message: `Couldn't work out this lease's invoice. Open the lease and check its charges and dates. (${error instanceof Error ? error.message : String(error)})`,
      });
      continue;
    }
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
      invoiceDate: draft.invoiceDate,
      dueDate: draft.dueDate,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      placeOfSupply: building.stateCode,
      supplyType: supply,
      taxableTotal: draft.totals.taxable,
      cgstTotal: draft.totals.cgst,
      sgstTotal: draft.totals.sgst,
      igstTotal: draft.totals.igst,
      roundOff: draft.totals.roundOff,
      grandTotal: draft.totals.grandTotal,
      expectedTds: draft.expectedTds.amount,
    });
    for (const [i, line] of draft.lines.entries())
      await insertLogged(s, invoiceLines, {
        invoiceId: invoice.id,
        leaseId: lease.id,
        chargeId: line.chargeId,
        chargeType: line.chargeType,
        position: i + 1,
        description: line.description,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        quantityLabel: line.quantityLabel,
        sacCode: line.sacCode,
        taxableAmount: line.taxablePaise,
        gstRateBp: line.gstRateBp,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        explanation: { amount: line.explanation, tax: line.taxExplanation },
      });
    result.drafted += 1;
  }
  return result;
}

/** A run month's invoices (drafts and sent), by tenant name. */
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
    .where(
      s.where(
        invoices,
        and(
          eq(invoices.runMonth, startOfMonth(runMonth)),
          ne(invoices.status, "cancelled"),
        ),
      ),
    )
    .orderBy(tenants.companyName);
}
