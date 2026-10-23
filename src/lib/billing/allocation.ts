/**
 * Payments against invoices (docs/BILLING_RULES.md, sections 10–11): which
 * TDS a payment most likely had deducted, how received + TDS is applied to
 * a tenant's unpaid invoices (oldest first), and how the TDS is split across
 * them. Pure: the caller passes the open invoices and the settings.
 */

import { compareDates, type PlainDate } from "./dates";
import { rupees } from "./explain";
import { sumPaise, type Paise } from "./money";
import { expectedTds, type TenantTds } from "./tds";
import type { BillingSettings, ChargeType, Explanation } from "./types";

/** An invoice with something left to pay. */
export type OpenInvoice = {
  id: string;
  number: string;
  dueDate: PlainDate;
  /** Total less credit notes and earlier payments (with their TDS). */
  outstandingPaise: Paise;
  /** TDS still expected on it (remainingExpectedTds). */
  expectedTdsPaise: Paise;
};

export type Allocation = { invoiceId: string; amountPaise: Paise };

/** Unpaid invoices, oldest first: by due date, then invoice number. */
export function oldestFirst<T extends OpenInvoice>(
  invoices: readonly T[],
): T[] {
  return invoices
    .filter((i) => i.outstandingPaise > 0)
    .sort(
      (a, b) =>
        compareDates(a.dueDate, b.dueDate) ||
        (a.number < b.number ? -1 : a.number > b.number ? 1 : 0),
    );
}

/**
 * An invoice's expected TDS once credit notes have taken taxable value off
 * it (D-017, [CA]): worked out again with `expectedTds` on what is left of
 * each line, using the tenant's TDS per charge type; with no credit, the
 * expected TDS stored on the invoice when it was made.
 */
export function expectedTdsAfterCredits({
  storedExpectedTdsPaise,
  lines,
  tds,
  settings,
}: {
  storedExpectedTdsPaise: Paise;
  lines: readonly {
    chargeType: ChargeType;
    taxablePaise: Paise;
    creditedTaxablePaise: Paise;
  }[];
  tds: TenantTds;
  settings: Pick<BillingSettings, "tdsRounding">;
}): Paise {
  if (!lines.some((l) => l.creditedTaxablePaise > 0))
    return storedExpectedTdsPaise;
  return expectedTds({
    lines: lines.map((l) => ({
      chargeType: l.chargeType,
      taxablePaise: Math.max(0, l.taxablePaise - l.creditedTaxablePaise),
    })),
    tds,
    settings,
  }).amount;
}

/**
 * TDS still expected on an invoice: its expected TDS (after credit notes,
 * expectedTdsAfterCredits) less TDS already recorded against it by active
 * payments; never below zero or above what is left to pay.
 */
export function remainingExpectedTds({
  expectedTdsPaise,
  tdsRecordedPaise,
  outstandingPaise,
}: {
  expectedTdsPaise: Paise;
  tdsRecordedPaise: Paise;
  outstandingPaise: Paise;
}): Paise {
  return Math.max(
    0,
    Math.min(
      expectedTdsPaise - tdsRecordedPaise,
      Math.max(0, outstandingPaise),
    ),
  );
}

/**
 * The TDS a payment most likely had deducted: if the amount received is the
 * oldest k invoices' total less their expected TDS (within
 * `tds.tolerancePaise` per invoice, inclusive), TDS is the difference.
 * Otherwise zero: a payment of the oldest invoices in full, or a part
 * payment the user fills in. The smallest k that matches wins.
 */
export function suggestTds({
  receivedPaise,
  invoices,
  settings,
}: {
  receivedPaise: Paise;
  invoices: readonly OpenInvoice[];
  settings: Pick<BillingSettings, "tdsTolerancePaise">;
}): { tdsPaise: Paise; explanation: Explanation } {
  const tolerance = settings.tdsTolerancePaise;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0)
    throw new RangeError(
      `TDS tolerance must be whole paise ≥ 0, got ${tolerance}`,
    );
  const steps: string[] = [];
  let owed = 0;
  let tds = 0;
  for (const [k, invoice] of oldestFirst(invoices).entries()) {
    owed += invoice.outstandingPaise;
    tds += invoice.expectedTdsPaise;
    steps.push(
      `Invoice ${invoice.number}: ${rupees(invoice.outstandingPaise)} to pay, ${rupees(invoice.expectedTdsPaise)} TDS expected`,
    );
    if (receivedPaise === owed) {
      steps.push(
        `${rupees(receivedPaise)} received pays the oldest invoices in full: no TDS`,
      );
      return done(0, steps);
    }
    const deducted = owed - receivedPaise;
    if (
      tds > 0 &&
      deducted > 0 &&
      Math.abs(deducted - tds) <= tolerance * (k + 1)
    ) {
      steps.push(
        `${rupees(receivedPaise)} received is ${rupees(owed)} less ${rupees(tds)} TDS expected`,
        `TDS deducted = ${rupees(owed)} − ${rupees(receivedPaise)} = ${rupees(deducted)}`,
      );
      return done(deducted, steps);
    }
    if (owed > receivedPaise + tds + tolerance * (k + 1)) break;
  }
  steps.push(
    `${rupees(receivedPaise)} doesn't match the oldest invoices less TDS: enter the TDS deducted yourself`,
  );
  return done(0, steps);
}

function done(tdsPaise: Paise, steps: string[]) {
  return {
    tdsPaise,
    explanation: {
      rule: "TDS from the amount received",
      steps,
      result: tdsPaise,
    },
  };
}

/**
 * Apply received + TDS to the unpaid invoices, oldest first (section 11).
 * What is left over stays as credit on the tenant's account.
 */
export function allocatePayment({
  receivedPaise,
  tdsPaise,
  invoices,
}: {
  receivedPaise: Paise;
  tdsPaise: Paise;
  invoices: readonly OpenInvoice[];
}): { allocations: Allocation[]; unallocatedPaise: Paise } {
  let left = receivedPaise + tdsPaise;
  const allocations: Allocation[] = [];
  for (const invoice of oldestFirst(invoices)) {
    if (left <= 0) break;
    const amount = Math.min(left, invoice.outstandingPaise);
    allocations.push({ invoiceId: invoice.id, amountPaise: amount });
    left -= amount;
  }
  return { allocations, unallocatedPaise: left };
}

/**
 * Split a payment's TDS across the invoices it is applied to, in their
 * order: each takes up to its expected TDS (and never more than is applied
 * to it); what remains goes on the last invoice that can take it. The caller
 * checks TDS ≤ the amount applied first (checkAllocation).
 */
export function splitTds({
  tdsPaise,
  allocations,
  invoices,
}: {
  tdsPaise: Paise;
  allocations: readonly Allocation[];
  invoices: readonly OpenInvoice[];
}): { invoiceId: string; tdsPaise: Paise }[] {
  if (tdsPaise <= 0) return [];
  const expected = new Map(invoices.map((i) => [i.id, i.expectedTdsPaise]));
  const split = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    room: a.amountPaise,
    tdsPaise: 0,
  }));
  let left = tdsPaise;
  for (const s of split) {
    const take = Math.min(left, expected.get(s.invoiceId) ?? 0, s.room);
    s.tdsPaise = take;
    left -= take;
  }
  for (let i = split.length - 1; i >= 0 && left > 0; i--) {
    const s = split[i]!;
    const take = Math.min(left, s.room - s.tdsPaise);
    s.tdsPaise += take;
    left -= take;
  }
  if (left > 0)
    throw new RangeError(
      `TDS ${rupees(tdsPaise)} is more than the amount applied to invoices`,
    );
  return split
    .filter((s) => s.tdsPaise > 0)
    .map(({ invoiceId, tdsPaise }) => ({ invoiceId, tdsPaise }));
}

/**
 * Why a payment and the amounts applied to invoices can't be saved, in
 * words for the screen, or null. Applied ≤ received + TDS (DATA_MODEL
 * invariant), each ≤ what is left on its invoice, and TDS is always against
 * an invoice, so it can't be more than the amount applied.
 */
export function checkAllocation({
  receivedPaise,
  tdsPaise,
  allocations,
  invoices,
}: {
  receivedPaise: Paise;
  tdsPaise: Paise;
  allocations: readonly Allocation[];
  invoices: readonly OpenInvoice[];
}): string | null {
  if (!Number.isSafeInteger(receivedPaise) || receivedPaise <= 0)
    return "Enter the amount received.";
  if (!Number.isSafeInteger(tdsPaise))
    return "Enter the TDS deducted in rupees, or 0.";
  if (tdsPaise < 0) return "TDS deducted can't be negative.";
  const open = new Map(invoices.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const a of allocations) {
    if (!Number.isSafeInteger(a.amountPaise) || a.amountPaise < 0)
      return "Amounts to apply can't be negative.";
    if (seen.has(a.invoiceId)) return "Each invoice can appear only once.";
    seen.add(a.invoiceId);
    const invoice = open.get(a.invoiceId);
    if (!invoice)
      return "One of the invoices isn't unpaid any more. Reload and try again.";
    if (a.amountPaise > invoice.outstandingPaise)
      return `Invoice ${invoice.number} has only ${rupees(invoice.outstandingPaise)} left to pay.`;
  }
  const applied = sumPaise(allocations.map((a) => a.amountPaise));
  const payment = receivedPaise + tdsPaise;
  if (applied > payment)
    return `You've applied ${rupees(applied)} but the payment is ${rupees(payment)} (${rupees(receivedPaise)} received + ${rupees(tdsPaise)} TDS).`;
  if (tdsPaise > applied)
    return `TDS of ${rupees(tdsPaise)} is more than the ${rupees(applied)} applied to invoices. TDS is always against an invoice: apply at least that much.`;
  return null;
}

/**
 * Where an invoice stands: paid once payments (with TDS) and credit notes
 * cover its total (DATA_MODEL invariant), part paid if a payment is applied,
 * otherwise unpaid. Nothing left to pay is never negative.
 */
export function invoiceSettlement({
  grandTotalPaise,
  allocatedPaise,
  creditedPaise,
}: {
  grandTotalPaise: Paise;
  allocatedPaise: Paise;
  creditedPaise: Paise;
}): { status: "paid" | "part_paid" | "unpaid"; outstandingPaise: Paise } {
  const outstanding = Math.max(
    0,
    grandTotalPaise - creditedPaise - allocatedPaise,
  );
  if (outstanding === 0) return { status: "paid", outstandingPaise: 0 };
  return {
    status: allocatedPaise > 0 ? "part_paid" : "unpaid",
    outstandingPaise: outstanding,
  };
}
