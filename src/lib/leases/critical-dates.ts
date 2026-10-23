// Critical dates generated from lease terms (docs/PRODUCT_PLAN.md, alerts):
// expiry, lock-in end, the last day to give notice, and every rent increase.
// Reminder days come from the alerts.* settings; the notice deadline has no
// setting and is reminded 30 and 7 days before.

import {
  addDays,
  addMonths,
  compareDates,
  type PlainDate,
} from "@/lib/billing/dates";
import { rentSchedule, type LeaseInput } from "@/lib/billing/schedule";
import type { BillingSettings } from "@/lib/billing/types";
import type { Settings } from "@/lib/settings/schema";

export type GeneratedCriticalDate = {
  type: "expiry" | "lock_in_end" | "escalation" | "notice_deadline";
  date: PlainDate;
  remindDays: number[];
};

const NOTICE_REMIND_DAYS = [30, 7];

/** The lease's critical dates, in date order. */
export function criticalDatesFor(
  lease: LeaseInput & {
    lockInEndDate?: PlainDate | null;
    noticePeriodMonths?: number | null;
  },
  billing: BillingSettings,
  settings: Pick<
    Settings,
    "alerts.expiryDays" | "alerts.increaseDays" | "alerts.lockInDays"
  >,
): GeneratedCriticalDate[] {
  const dates: GeneratedCriticalDate[] = [
    {
      type: "expiry",
      date: lease.endDate,
      remindDays: settings["alerts.expiryDays"],
    },
  ];
  if (lease.lockInEndDate) {
    dates.push({
      type: "lock_in_end",
      date: lease.lockInEndDate,
      remindDays: settings["alerts.lockInDays"],
    });
  }
  if (lease.noticePeriodMonths) {
    // Notice given on this day ends the lease on its last day.
    const date = addDays(
      addMonths(
        addDays(lease.endDate, 1),
        -lease.noticePeriodMonths,
        billing.monthEndRule,
      ),
      -1,
    );
    if (compareDates(date, lease.startDate) >= 0) {
      dates.push({
        type: "notice_deadline",
        date,
        remindDays: NOTICE_REMIND_DAYS,
      });
    }
  }

  // A rent increase is where a rent charge's full-period rate goes up.
  const increases = new Set<PlainDate>();
  const lastRate = new Map<string, number>();
  for (const p of rentSchedule(lease, billing).periods) {
    if (p.charge.type !== "rent") continue;
    for (const s of p.segments) {
      const before = lastRate.get(p.chargeId);
      if (before !== undefined && s.rate > before) increases.add(s.from);
      lastRate.set(p.chargeId, s.rate);
    }
  }
  for (const date of increases) {
    dates.push({
      type: "escalation",
      date,
      remindDays: settings["alerts.increaseDays"],
    });
  }

  return dates.sort((a, b) => compareDates(a.date, b.date));
}
