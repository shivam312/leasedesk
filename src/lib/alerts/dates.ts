// Acting on a lease date from the Today list: mark it done, or hide it for
// SNOOZE_DAYS ("Remind me later"). Both are logged.

import { and, eq, ne } from "drizzle-orm";
import { addDays, type PlainDate } from "@/lib/billing/dates";
import { updateLogged } from "@/lib/db/activity-log";
import { criticalDates } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { Settings } from "@/lib/settings/schema";
import { SNOOZE_DAYS } from "./attention";

/** Mark a lease date done. False if it couldn't be found. */
export async function markDateDone(s: Scoped, id: string): Promise<boolean> {
  return (
    (await updateLogged(s, criticalDates, id, {
      status: "done",
      snoozedUntil: null,
    })) !== null
  );
}

/** Hide a lease date until SNOOZE_DAYS from today. Returns that day, or null. */
export async function snoozeDate(
  s: Scoped,
  id: string,
  today: PlainDate,
): Promise<PlainDate | null> {
  const [row] = await s.tx
    .select({ status: criticalDates.status })
    .from(criticalDates)
    .where(s.where(criticalDates, eq(criticalDates.id, id)));
  if (!row || row.status === "done") return null;
  const until = addDays(today, SNOOZE_DAYS);
  const saved = await updateLogged(s, criticalDates, id, {
    status: "snoozed",
    snoozedUntil: until,
  });
  return saved ? until : null;
}

/** The setting that holds each generated lease date's reminder days. */
const REMIND_SETTING = {
  expiry: "alerts.expiryDays",
  escalation: "alerts.increaseDays",
  lock_in_end: "alerts.lockInDays",
} as const;

/**
 * After the alerts settings change: give every lease date that isn't done
 * the new reminder days, so the change reaches leases saved before it, not
 * only new ones. Returns how many dates changed; each change is logged.
 */
export async function applyReminderDays(
  s: Scoped,
  settings: Pick<
    Settings,
    (typeof REMIND_SETTING)[keyof typeof REMIND_SETTING]
  >,
): Promise<number> {
  let changed = 0;
  for (const [type, key] of Object.entries(REMIND_SETTING) as [
    keyof typeof REMIND_SETTING,
    (typeof REMIND_SETTING)[keyof typeof REMIND_SETTING],
  ][]) {
    const days = settings[key];
    const rows = await s.tx
      .select({ id: criticalDates.id, remindDays: criticalDates.remindDays })
      .from(criticalDates)
      .where(
        s.where(
          criticalDates,
          and(eq(criticalDates.type, type), ne(criticalDates.status, "done")),
        ),
      );
    for (const r of rows) {
      if (r.remindDays.join() === days.join()) continue;
      await updateLogged(s, criticalDates, r.id, { remindDays: [...days] });
      changed++;
    }
  }
  return changed;
}
