// Settings → Billing rules: what the automatic reminders would send, and
// when, for a sample invoice, so a landlord sees it before turning them on.
// Pure.

import { addDays, type PlainDate } from "@/lib/billing/dates";
import { formatDate } from "@/lib/format";
import { reminderEmail, reminderStepWords } from "./email";

export type ReminderPreview = {
  /** Each email in date order: when, which step, and its subject. */
  timeline: { date: PlainDate; when: string; subject: string }[];
  /** The first overdue reminder in full (or the first one, if none is after the due date). */
  sample: { subject: string; text: string } | null;
};

export function reminderPreview(input: {
  beforeDueDays: readonly number[];
  afterDueDays: readonly number[];
  /** The sample invoice's date (the 1st of a month) and the building's payment terms. */
  invoiceDate: PlainDate;
  dueDays: number;
  businessName: string;
}): ReminderPreview {
  const dueDate = addDays(input.invoiceDate, input.dueDays);
  const doc = {
    number: "SCT/26-27/0001",
    invoiceDate: formatDate(input.invoiceDate),
    property: "Unit 301, your building",
    recipient: { name: "Your tenant" },
    supplier: { name: input.businessName },
    payment: null,
  };
  const amountPaise = 1_06_200_00; // ₹1,18,000 less ₹11,800 TDS
  const steps = [
    ...[...new Set(input.beforeDueDays)].map((d) => ({
      step: `before:${d}`,
      kind: "before" as const,
      date: addDays(dueDate, -d),
    })),
    ...[...new Set(input.afterDueDays)].map((d) => ({
      step: `after:${d}`,
      kind: "after" as const,
      date: addDays(dueDate, d),
    })),
  ]
    // Never before the invoice is sent (as the schedule).
    .filter((s) => s.date >= input.invoiceDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const emails = steps.map((s) => ({
    ...s,
    email: reminderEmail(doc, {
      to: [],
      kind: s.kind,
      today: s.date,
      dueDate,
      amountPaise,
    }),
  }));
  const first =
    emails.find((e) => e.kind === "after" && e.date > dueDate) ?? emails[0];
  return {
    timeline: emails.map((e) => ({
      date: e.date,
      when: reminderStepWords(e.step),
      subject: e.email.subject,
    })),
    sample: first
      ? { subject: first.email.subject, text: first.email.text }
      : null,
  };
}
