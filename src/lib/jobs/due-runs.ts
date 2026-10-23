// Which organizations the scheduled billing run makes drafts for today.

import type { PlainDate, YearMonth } from "@/lib/billing/dates";
import { scheduledRunMonth } from "@/lib/invoices/schedule";
import { resolveSettings } from "@/lib/settings/resolve";

/**
 * Each organization whose run day (`invoice.runDay`) is today, with the month
 * to bill. An organization whose stored settings don't parse is skipped
 * rather than stopping the others; making invoices by hand on the Billing
 * page lists the problem for each lease.
 */
export function dueRuns(
  organizations: { id: string; settings: unknown }[],
  today: PlainDate,
): { organizationId: string; month: YearMonth }[] {
  return organizations.flatMap(({ id, settings }) => {
    let runDay: number;
    try {
      runDay = resolveSettings({ organization: settings })["invoice.runDay"];
    } catch {
      return [];
    }
    const month = scheduledRunMonth(today, runDay);
    return month ? [{ organizationId: id, month }] : [];
  });
}
