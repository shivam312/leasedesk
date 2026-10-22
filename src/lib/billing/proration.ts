import {
  addDays,
  compareDates,
  daysBetweenInclusive,
  maxDate,
  minDate,
} from "./dates";
import type { PlainDate } from "./dates";
import { rupees } from "./explain";
import { formatDate } from "@/lib/format";
import { prorate } from "./money";
import type { AmountStep, Explanation } from "./types";

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
 * A segment covering the whole period is billed at the full amount; any
 * other segment is amount × days ÷ days in the period, rounded to the paisa.
 */
export function segmentsForPeriod({
  steps,
  window,
  period,
}: {
  steps: readonly AmountStep[];
  window: { from: PlainDate; to: PlainDate };
  period: { start: PlainDate; end: PlainDate };
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
    const amount = full ? step.amount : prorate(step.amount, days, periodDays);
    const last = full
      ? `Full ${periodDays > 31 ? "quarter" : "month"}: ${rupees(amount)}`
      : `${formatDate(from)} to ${formatDate(to)}: ${rupees(step.amount)} × ${days} / ${periodDays} days = ${rupees(amount)}`;
    segments.push({
      from,
      to,
      days,
      periodDays,
      rate: step.amount,
      amount,
      explanation: {
        rule: full ? step.explanation.rule : "Part period, by actual days",
        steps: [...step.explanation.steps, last],
        result: amount,
      },
    });
  });
  return segments;
}
