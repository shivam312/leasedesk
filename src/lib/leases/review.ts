// The lease form's review step: the full schedule for the whole lease term,
// one row per monthly run, before saving (docs/PRODUCT_PLAN.md, lease setup).
// Amounts come from the billing engine; this only groups them.

import { monthOf, monthsBetween, type YearMonth } from "@/lib/billing/dates";
import { sumPaise, type Paise } from "@/lib/billing/money";
import { rentSchedule, type LeaseInput } from "@/lib/billing/schedule";
import type { BillingSettings } from "@/lib/billing/types";

export type ReviewRow = {
  /** The monthly run that bills these amounts, so rows match the invoices. */
  month: YearMonth;
  /** Rent before GST. */
  rent: Paise;
  /** Every other charge before GST. */
  other: Paise;
  total: Paise;
  /** A rent charge's monthly or quarterly amount went up in this run. */
  rentIncreased: boolean;
};

/**
 * One row for every month from the lease start to its last bill, including
 * rent-free months with nothing to bill.
 */
export function reviewRows(
  lease: LeaseInput,
  settings: BillingSettings,
): ReviewRow[] {
  const { periods } = rentSchedule(lease, settings);
  const lastBilled = periods.reduce<YearMonth>(
    (last, p) => (p.billedIn > last ? p.billedIn : last),
    monthOf(lease.endDate),
  );
  const rows = new Map<
    YearMonth,
    { rent: Paise[]; other: Paise[]; rentIncreased: boolean }
  >(
    monthsBetween(lease.startDate, `${lastBilled}-01`).map((m) => [
      m,
      { rent: [], other: [], rentIncreased: false },
    ]),
  );

  // Full-period rate of each rent charge so far; periods are in date order.
  const lastRate = new Map<string, number>();
  for (const p of periods) {
    const row = rows.get(p.billedIn);
    if (!row) continue;
    if (p.charge.type !== "rent") {
      row.other.push(p.amount);
      continue;
    }
    row.rent.push(p.amount);
    for (const s of p.segments) {
      const before = lastRate.get(p.chargeId);
      if (before !== undefined && s.rate > before) row.rentIncreased = true;
      lastRate.set(p.chargeId, s.rate);
    }
  }

  return [...rows.entries()].map(([month, r]) => {
    const rent = sumPaise(r.rent);
    const other = sumPaise(r.other);
    return {
      month,
      rent,
      other,
      total: sumPaise([rent, other]),
      rentIncreased: r.rentIncreased,
    };
  });
}
