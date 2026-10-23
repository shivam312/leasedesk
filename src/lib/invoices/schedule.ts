// When the scheduled billing run makes an organization's drafts (setting
// invoice.runDay, docs/SETTINGS.md).

import {
  addMonthsToMonth,
  monthOf,
  parseDate,
  type PlainDate,
  type YearMonth,
} from "@/lib/billing/dates";

/**
 * The month to make drafts for on `today`, or null if today isn't the run
 * day. Run day 1: that month's invoices on the 1st. Any later day: the next
 * month's, ahead of time (25 Oct → Nov invoices). Invoices are still dated
 * the 1st of their month.
 */
export function scheduledRunMonth(
  today: PlainDate,
  runDay: number,
): YearMonth | null {
  if (parseDate(today).day !== runDay) return null;
  return runDay === 1 ? monthOf(today) : addMonthsToMonth(monthOf(today), 1);
}
