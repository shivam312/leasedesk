// The lease form's review step: the full schedule for the whole lease term,
// one row per monthly run, before saving (docs/PRODUCT_PLAN.md, lease setup).
// Amounts come from the billing engine; this only groups them.

import { monthOf, monthsBetween, type YearMonth } from "@/lib/billing/dates";
import { sumPaise, type Paise } from "@/lib/billing/money";
import { chargeBaseAmount } from "@/lib/billing/charges";
import { rentSchedule, type LeaseInput } from "@/lib/billing/schedule";
import type { BillingSettings, Charge } from "@/lib/billing/types";
import { formatINR } from "@/lib/format";

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

/**
 * A charge's amount for one billing period, before rent increases, and the
 * engine's working for it (null for a fixed amount, which needs none).
 */
export function chargeSummary(charge: Charge): {
  amount: string;
  how: string | null;
} {
  const base = chargeBaseAmount(charge);
  const per = charge.frequency === "quarterly" ? "a quarter" : "a month";
  return {
    amount: `${formatINR(base.amount)} ${per}`,
    how: charge.basis === "fixed" ? null : base.explanation.steps.join(" · "),
  };
}

/** How many months the lease page shows on a phone before "Show all". */
export const PHONE_SCHEDULE_MONTHS = 12;

/**
 * The rows a phone shows first: the next 12 months from `month` (this month
 * included). A lease that hasn't started shows its first 12; one that has
 * ended, its last 12.
 */
export function upcomingRows<T extends { month: YearMonth }>(
  rows: readonly T[],
  month: YearMonth,
  count = PHONE_SCHEDULE_MONTHS,
): T[] {
  const from = rows.findIndex((r) => r.month >= month);
  const start = from === -1 ? Math.max(0, rows.length - count) : from;
  return rows.slice(start, start + count);
}
