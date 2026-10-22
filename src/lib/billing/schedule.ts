import {
  addDays,
  compareDates,
  endOfMonth,
  fyQuarter,
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
  period: Period;
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

  return periods.flatMap((period) => {
    const segments = segmentsForPeriod({ steps, window, period });
    if (segments.length === 0) return [];
    return [
      {
        chargeId: charge.id,
        charge,
        period,
        segments,
        amount: sumPaise(segments.map((s) => s.amount)),
      },
    ];
  });
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

  const totals = new Map<YearMonth, Paise[]>();
  for (const p of periods) {
    const month = monthOf(p.period.start);
    totals.set(month, [...(totals.get(month) ?? []), p.amount]);
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
