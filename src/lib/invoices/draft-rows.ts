// The engine's draft invoice as invoice and line columns, used both to save a
// draft (runBilling) and to check it is still right when it's sent
// (issueInvoice). Pure.

import type { DraftInvoice } from "@/lib/billing/draft-invoice";
import type { SupplyType } from "@/lib/billing/gst";

/** The draft's invoice columns that depend on the lease and settings. */
export function invoiceRow(draft: DraftInvoice, supply: SupplyType) {
  return {
    invoiceDate: draft.invoiceDate,
    dueDate: draft.dueDate,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    supplyType: supply,
    taxableTotal: draft.totals.taxable,
    cgstTotal: draft.totals.cgst,
    sgstTotal: draft.totals.sgst,
    igstTotal: draft.totals.igst,
    roundOff: draft.totals.roundOff,
    grandTotal: draft.totals.grandTotal,
    expectedTds: draft.expectedTds.amount,
  };
}

/** The draft's line columns, in order. */
export function lineRows(draft: DraftInvoice) {
  return draft.lines.map((line, i) => ({
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
  }));
}

type Row = Record<string, unknown>;

/** True if every key of `expected` (but `explanation`) has the same value in `saved`. */
function same(saved: Row, expected: Row): boolean {
  return Object.entries(expected).every(
    ([key, value]) => key === "explanation" || saved[key] === value,
  );
}

/**
 * Whether a saved draft no longer matches what its lease bills now (`fresh`,
 * null if nothing): the lease, its charges or a billing rule changed since
 * the month's invoices were made. Sending it would bill the old amounts.
 */
export function draftChanged(
  saved: { invoice: Row; lines: Row[] },
  fresh: DraftInvoice | null,
  supply: SupplyType,
): boolean {
  if (!fresh) return true;
  const lines = lineRows(fresh);
  return (
    !same(saved.invoice, invoiceRow(fresh, supply)) ||
    saved.lines.length !== lines.length ||
    lines.some((line, i) => !same(saved.lines[i]!, line))
  );
}
