import {
  addDays,
  compareDates,
  daysBetweenInclusive,
  daysInYearMonth,
  endOfMonth,
  maxDate,
  minDate,
  monthOf,
  monthsBetween,
  startOfMonth,
} from "./dates";
import type { PlainDate } from "./dates";
import { rupees } from "./explain";
import { formatDate, formatMonth } from "@/lib/format";
import { mulDiv, prorate, sumPaise } from "./money";
import type { AmountStep, BillingSettings, Explanation } from "./types";

export type Segment = {
  from: PlainDate;
  to: PlainDate;
  days: number;
  periodDays: number;
  /** The charge's amount for a full period during this segment. */
  rate: number;
  amount: number;
  explanation: Explanation;
};

/**
 * Splits one billing period into segments with a single amount each, and
 * pro-rates part periods by actual days (docs/BILLING_RULES.md, section 6).
 *
 * - `steps`: the charge's amount over time (from `amountSteps`).
 * - `window`: the dates the charge can be billed for, inclusive.
 * - `period`: a calendar month, or a quarter for quarterly charges.
 *
 * A segment covering the whole period is billed at the full amount. Any
 * other segment of a month is amount × days ÷ days in the month. Any other
 * segment of a quarter follows `billing.partPeriodMethod` (section 7, D-001)
 * [Pilot]: month by month (default), or amount × days ÷ days in the quarter.
 */
export function segmentsForPeriod({
  steps,
  window,
  period,
  settings,
}: {
  steps: readonly AmountStep[];
  window: { from: PlainDate; to: PlainDate };
  period: { start: PlainDate; end: PlainDate };
  settings: Pick<BillingSettings, "partPeriodMethod">;
}): Segment[] {
  const periodDays = daysBetweenInclusive(period.start, period.end);
  const lo = maxDate(period.start, window.from);
  const hi = minDate(period.end, window.to);
  if (compareDates(lo, hi) > 0) return [];

  const first = steps[0];
  if (!first || compareDates(lo, first.from) < 0) {
    throw new Error(
      `There is no amount for ${lo}: the charge starts on ${first?.from ?? "an unknown date"}`,
    );
  }

  const segments: Segment[] = [];
  steps.forEach((step, i) => {
    const next = steps[i + 1];
    const stepEnd = next ? addDays(next.from, -1) : hi;
    const from = maxDate(lo, step.from);
    const to = minDate(hi, stepEnd);
    if (compareDates(from, to) > 0) return;

    const days = daysBetweenInclusive(from, to);
    const full = days === periodDays;
    const quarter = monthOf(period.start) !== monthOf(period.end);
    let amount: number;
    let last: string[];
    if (full) {
      amount = step.amount;
      last = [`Full ${quarter ? "quarter" : "month"}: ${rupees(amount)}`];
    } else if (quarter && settings.partPeriodMethod === "month_by_month") {
      ({ amount, steps: last } = partQuarterByMonth(step.amount, from, to));
    } else {
      amount = prorate(step.amount, days, periodDays);
      last = [
        `${formatDate(from)} to ${formatDate(to)}: ${rupees(step.amount)} × ${days} / ${periodDays} days = ${rupees(amount)}`,
      ];
    }
    segments.push({
      from,
      to,
      days,
      periodDays,
      rate: step.amount,
      amount,
      explanation: {
        rule: full ? step.explanation.rule : "Part period, by actual days",
        steps: [...step.explanation.steps, ...last],
        result: amount,
      },
    });
  });
  return segments;
}

/**
 * Part of a quarter, month by month: the monthly equivalent is the quarterly
 * amount ÷ 3; a full month bills that, a part month bills it × days ÷ days in
 * that month. Each month is rounded to the paisa once:
 * quarterly × days ÷ (3 × days in month).
 */
function partQuarterByMonth(
  quarterly: number,
  from: PlainDate,
  to: PlainDate,
): { amount: number; steps: string[] } {
  const pieces = monthsBetween(from, to).map((month) => {
    const lo = maxDate(from, startOfMonth(month));
    const hi = minDate(to, endOfMonth(month));
    const days = daysBetweenInclusive(lo, hi);
    const monthDays = daysInYearMonth(month);
    const amount = mulDiv(quarterly, days, 3 * monthDays);
    const step =
      days === monthDays
        ? `${formatMonth(month)}: ${rupees(quarterly)} ÷ 3 = ${rupees(amount)}`
        : `${formatDate(lo)} to ${formatDate(hi)}: ${rupees(quarterly)} ÷ 3 × ${days} / ${monthDays} days = ${rupees(amount)}`;
    return { amount, step };
  });
  const amount = sumPaise(pieces.map((p) => p.amount));
  const steps = pieces.map((p) => p.step);
  if (pieces.length > 1) {
    steps.push(
      `${formatDate(from)} to ${formatDate(to)}: ${pieces.map((p) => rupees(p.amount)).join(" + ")} = ${rupees(amount)}`,
    );
  }
  return { amount, steps };
}
