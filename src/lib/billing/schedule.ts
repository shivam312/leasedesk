import {
  addDays,
  addMonthsToMonth,
  compareDates,
  endOfMonth,
  fyQuarter,
  minDate,
  monthOf,
  monthsBetween,
  startOfMonth,
} from "./dates";
import type { PlainDate, YearMonth } from "./dates";
import { amountSteps } from "./escalation";
import { sumPaise } from "./money";
import type { Paise } from "./money";
import { segmentsForPeriod } from "./proration";
import type { Segment } from "./proration";
import { chargeBillingWindow, rentCommencement } from "./rent-free";
import type {
  Charge,
  CustomEscalation,
  EscalationRule,
  LeaseTerms,
} from "./types";

/** Everything the engine needs to bill one lease. */
export type LeaseInput = LeaseTerms & {
  charges: Charge[];
  escalationRules?: EscalationRule[];
  customEscalations?: CustomEscalation[];
};

/** Organization settings that change amounts (docs/BILLING_RULES.md, section 2). */
export type BillingSettings = { roundEscalatedRentToRupee: boolean };

export type Period = { start: PlainDate; end: PlainDate };

/** One charge for one billing period (month, or FY quarter if quarterly). */
export type ChargePeriod = {
  chargeId: string;
  charge: Charge;
  /** The dates billed: inside the lease and the charge's own dates. */
  period: Period;
  /** The whole calendar month or FY quarter the dates fall in. */
  calendarPeriod: Period;
  /** The monthly run that bills this period (section 7). */
  billedIn: YearMonth;
  segments: Segment[];
  amount: Paise;
};

/** Every billing period of one charge that has something to bill. */
export function chargePeriods(
  charge: Charge,
  lease: LeaseInput,
  settings: BillingSettings,
): ChargePeriod[] {
  const window = chargeBillingWindow(charge, lease);
  if (!window) return [];
  const steps = amountSteps({
    charge,
    lease,
    rules: lease.escalationRules,
    custom: lease.customEscalations,
    roundEscalatedRentToRupee: settings.roundEscalatedRentToRupee,
  });
  const periods =
    (charge.frequency ?? "monthly") === "quarterly"
      ? quartersBetween(window.from, window.to)
      : monthsBetween(window.from, window.to).map((m) => ({
          start: startOfMonth(m),
          end: endOfMonth(m),
        }));

  return periods.flatMap((calendarPeriod) => {
    const segments = segmentsForPeriod({
      steps,
      window,
      period: calendarPeriod,
    });
    const first = segments[0];
    const last = segments.at(-1);
    if (!first || !last) return [];
    const period = { start: first.from, end: last.to };
    return [
      {
        chargeId: charge.id,
        charge,
        period,
        calendarPeriod,
        billedIn: billingRun(charge, period, calendarPeriod, lease),
        segments,
        amount: sumPaise(segments.map((s) => s.amount)),
      },
    ];
  });
}

/**
 * The monthly run that bills a period (section 7). In advance: the month its
 * billed dates start. In arrears: the run after the calendar period ends, or
 * the run after the lease ends if that is sooner.
 */
function billingRun(
  charge: Charge,
  period: Period,
  calendarPeriod: Period,
  lease: LeaseTerms,
): YearMonth {
  if ((charge.timing ?? "advance") === "arrears") {
    const last = minDate(calendarPeriod.end, lease.endDate);
    return addMonthsToMonth(monthOf(last), 1);
  }
  return monthOf(period.start);
}

/** The full schedule for a lease: every charge, every period, in date order. */
export function rentSchedule(
  lease: LeaseInput,
  settings: BillingSettings,
): {
  rentStartsOn: PlainDate;
  periods: ChargePeriod[];
  totalsByMonth: { month: YearMonth; total: Paise }[];
} {
  const periods = lease.charges
    .flatMap((charge) => chargePeriods(charge, lease, settings))
    .sort((a, b) => compareDates(a.period.start, b.period.start));

  // Totals by the month whose run bills them, so they match the invoices.
  const totals = new Map<YearMonth, Paise[]>();
  for (const p of periods) {
    totals.set(p.billedIn, [...(totals.get(p.billedIn) ?? []), p.amount]);
  }
  return {
    rentStartsOn: rentCommencement(lease).date,
    periods,
    totalsByMonth: [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amounts]) => ({ month, total: sumPaise(amounts) })),
  };
}

function quartersBetween(from: PlainDate, to: PlainDate): Period[] {
  const quarters: Period[] = [];
  let q = fyQuarter(from);
  while (compareDates(q.start, to) <= 0) {
    quarters.push({ start: q.start, end: q.end });
    q = fyQuarter(addDays(q.end, 1));
  }
  return quarters;
}
