// When an automatic payment reminder goes, and what it asks for
// (docs/BILLING_RULES.md section 14). Pure: the daily job passes today's
// date and the steps already sent.

import { addDays, compareDates, type PlainDate } from "@/lib/billing/dates";

/** A step sent up to this many days late (the job missed a day) still goes. */
export const CATCH_UP_DAYS = 3;

export type ReminderStep = {
  /** Stored on the reminder, e.g. "before:3", "after:7". */
  step: string;
  kind: "before" | "after";
  days: number;
};

/**
 * The reminder to send today, if any: the latest step whose day has come, if
 * it is at most CATCH_UP_DAYS late and wasn't sent already. Earlier steps
 * that were missed are skipped, so a tenant never gets a burst. A step that
 * fell before the invoice was sent is never used, and a before-due reminder
 * isn't sent once the due date has passed.
 */
export function reminderDue(input: {
  sentOn: PlainDate;
  dueDate: PlainDate;
  today: PlainDate;
  beforeDueDays: readonly number[];
  afterDueDays: readonly number[];
  sent: readonly string[];
}): ReminderStep | null {
  const { sentOn, dueDate, today } = input;
  const steps = [
    ...new Set(input.beforeDueDays.map((d) => `before:${d}`)),
    ...new Set(input.afterDueDays.map((d) => `after:${d}`)),
  ].map((step) => {
    const [kind, days] = step.split(":") as ["before" | "after", string];
    const n = Number(days);
    return {
      step,
      kind,
      days: n,
      on: addDays(dueDate, kind === "before" ? -n : n),
    };
  });
  const latest = steps
    .filter((s) => compareDates(s.on, today) <= 0)
    .sort((a, b) => compareDates(b.on, a.on))[0];
  if (!latest) return null;
  if (input.sent.includes(latest.step)) return null;
  if (compareDates(latest.on, sentOn) < 0) return null;
  if (compareDates(addDays(latest.on, CATCH_UP_DAYS), today) < 0) return null;
  if (latest.kind === "before" && compareDates(today, dueDate) > 0) return null;
  if (
    latest.kind === "before" &&
    latest.days > 0 &&
    compareDates(today, dueDate) === 0
  )
    return null;
  return { step: latest.step, kind: latest.kind, days: latest.days };
}

/**
 * What a reminder asks the tenant to pay: what is left on the invoice less
 * the TDS they are still expected to deduct, never below 0. Nothing to ask
 * means no reminder (the TDS certificate is chased separately).
 */
export function amountToAsk(open: {
  outstandingPaise: number;
  expectedTdsPaise: number;
}): number {
  return Math.max(open.outstandingPaise - open.expectedTdsPaise, 0);
}

/**
 * The automatic reminder for an invoice today, with the amount it asks for:
 * the step from reminderDue, unless there is nothing to ask.
 */
export function reminderToSend(
  input: Parameters<typeof reminderDue>[0] & {
    outstandingPaise: number;
    expectedTdsPaise: number;
  },
): (ReminderStep & { amountPaise: number }) | null {
  const amountPaise = amountToAsk(input);
  if (amountPaise === 0) return null;
  const step = reminderDue(input);
  return step && { ...step, amountPaise };
}
