import {
  addDays,
  addMonthsToMonth,
  minDate,
  monthOf,
  startOfMonth,
} from "./dates";
import type { PlainDate, YearMonth } from "./dates";
import { formatDate, formatMonth } from "@/lib/format";
import type { BasisPoints, Paise } from "./money";
import { chargePeriods } from "./schedule";
import type { BillingSettings, ChargePeriod, LeaseInput } from "./schedule";
import type { Charge, ChargeType, Explanation } from "./types";

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
 * - A period split by a rent increase gives one line per part.
 */
export function invoiceForRun(
  lease: LeaseInput,
  runMonth: YearMonth,
  settings: BillingSettings & { dueDays: number },
): { invoiceDate: PlainDate; dueDate: PlainDate; lines: InvoiceLine[] } | null {
  if (!Number.isSafeInteger(settings.dueDays) || settings.dueDays < 0) {
    throw new RangeError(
      `Due days must be a whole number ≥ 0, got ${settings.dueDays}`,
    );
  }
  const lines = lease.charges.flatMap((charge) =>
    chargePeriods(charge, lease, settings)
      .filter((p) => billingRun(charge, p, lease) === runMonth)
      .flatMap((p) => linesFor(charge, p)),
  );
  if (lines.length === 0) return null;
  const invoiceDate = startOfMonth(runMonth);
  return {
    invoiceDate,
    dueDate: addDays(invoiceDate, settings.dueDays),
    lines,
  };
}

function billingRun(
  charge: Charge,
  p: ChargePeriod,
  lease: LeaseInput,
): YearMonth {
  if ((charge.timing ?? "advance") === "arrears") {
    const last = minDate(p.period.end, lease.endDate);
    return addMonthsToMonth(monthOf(last), 1);
  }
  const first = p.segments[0];
  if (!first) throw new Error(`Charge ${charge.id} has an empty period`);
  return monthOf(first.from);
}

function linesFor(charge: Charge, p: ChargePeriod): InvoiceLine[] {
  const noun = charge.label ?? NOUNS[charge.type];
  return p.segments.map((segment) => {
    const whole =
      segment.from === p.period.start && segment.to === p.period.end;
    return {
      chargeId: charge.id,
      chargeType: charge.type,
      description: whole
        ? `${noun} for ${periodLabel(p.period.start, p.period.end)}`
        : `${noun} ${formatDate(segment.from)} to ${formatDate(segment.to)}`,
      periodStart: segment.from,
      periodEnd: segment.to,
      taxablePaise: segment.amount,
      gstRateBp: charge.gstRateBp,
      sacCode: charge.sacCode,
      explanation: segment.explanation,
    };
  });
}

/** "Oct 2026" for a month, "Jul–Sep 2026" for a quarter. */
function periodLabel(start: PlainDate, end: PlainDate): string {
  if (monthOf(start) === monthOf(end)) return formatMonth(start);
  return `${formatMonth(start).slice(0, 3)}–${formatMonth(end)}`;
}
