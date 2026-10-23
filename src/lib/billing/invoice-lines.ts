import { addDays, monthOf, startOfMonth } from "./dates";
import type { PlainDate, YearMonth } from "./dates";
import { formatDate, formatMonth } from "@/lib/format";
import { rupees } from "./explain";
import type { BasisPoints, Paise } from "./money";
import { chargePeriods } from "./schedule";
import type { ChargePeriod, LeaseInput } from "./schedule";
import type { BillingSettings, Charge, ChargeType, Explanation } from "./types";

export type InvoiceLine = {
  chargeId: string;
  chargeType: ChargeType;
  description: string;
  periodStart: PlainDate;
  periodEnd: PlainDate;
  taxablePaise: Paise;
  gstRateBp: BasisPoints;
  sacCode: string;
  explanation: Explanation;
};

const NOUNS: Record<ChargeType, string> = {
  rent: "Rent",
  cam: "Maintenance (CAM)",
  parking: "Parking",
  utilities: "Utilities",
  signage: "Signage",
  other: "Other charge",
};

/**
 * The draft invoice lines for one lease in one monthly run
 * (docs/BILLING_RULES.md, section 7). `null` when there is nothing to bill.
 *
 * - In advance (default): a period is billed in the run of the month its
 *   billable days start (the period's first month, or later if the charge
 *   starts mid-period).
 * - In arrears: a period is billed in the run after the period ends, or the
 *   run after the lease ends if that is sooner (a lease ending mid-quarter).
 * - A period split by a rent increase gives one line per part, or one line
 *   with `midMonthIncreaseLines: "one_line"`.
 * - With `skipZeroInvoices` (default), ₹0 lines are skipped and with no
 *   lines left there is no invoice; without it ₹0 lines stay.
 */
export function invoiceForRun(
  lease: LeaseInput,
  runMonth: YearMonth,
  settings: BillingSettings,
): { invoiceDate: PlainDate; dueDate: PlainDate; lines: InvoiceLine[] } | null {
  if (!Number.isSafeInteger(settings.dueDays) || settings.dueDays < 0) {
    throw new RangeError(
      `Due days must be a whole number ≥ 0, got ${settings.dueDays}`,
    );
  }
  const lines = lease.charges
    .flatMap((charge) =>
      chargePeriods(charge, lease, settings)
        .filter((p) => p.billedIn === runMonth)
        .flatMap((p) => linesFor(charge, p, settings)),
    )
    .filter((line) => !settings.skipZeroInvoices || line.taxablePaise !== 0);
  if (lines.length === 0) return null;
  const invoiceDate = startOfMonth(runMonth);
  return {
    invoiceDate,
    dueDate: addDays(invoiceDate, settings.dueDays),
    lines,
  };
}

function linesFor(
  charge: Charge,
  p: ChargePeriod,
  settings: Pick<BillingSettings, "midMonthIncreaseLines">,
): InvoiceLine[] {
  const noun = charge.label ?? NOUNS[charge.type];
  const line = (
    from: PlainDate,
    to: PlainDate,
    taxablePaise: Paise,
    explanation: Explanation,
  ): InvoiceLine => ({
    chargeId: charge.id,
    chargeType: charge.type,
    description:
      from === p.calendarPeriod.start && to === p.calendarPeriod.end
        ? `${noun} for ${periodLabel(from, to)}`
        : `${noun} ${formatDate(from)} to ${formatDate(to)}`,
    periodStart: from,
    periodEnd: to,
    taxablePaise,
    gstRateBp: charge.gstRateBp,
    sacCode: charge.sacCode,
    explanation,
  });

  // billing.midMonthIncreaseLines = one_line: a period split by an increase
  // is one line, the sum of its parts (each part still pro-rated and rounded
  // on its own); the explanation keeps every part.
  if (settings.midMonthIncreaseLines === "one_line" && p.segments.length > 1) {
    const amounts = p.segments.map((s) => s.amount);
    return [
      line(p.period.start, p.period.end, p.amount, {
        rule: "Part periods at different amounts",
        steps: [
          ...p.segments.flatMap((s) => s.explanation.steps),
          `Total: ${amounts.map(rupees).join(" + ")} = ${rupees(p.amount)}`,
        ],
        result: p.amount,
      }),
    ];
  }
  return p.segments.map((s) => line(s.from, s.to, s.amount, s.explanation));
}

/** "Oct 2026" for a month, "Jul–Sep 2026" for a quarter. */
function periodLabel(start: PlainDate, end: PlainDate): string {
  if (monthOf(start) === monthOf(end)) return formatMonth(start);
  return `${formatMonth(start).slice(0, 3)}–${formatMonth(end)}`;
}
