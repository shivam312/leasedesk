// The payment reminder email. Pure, so the words are tested without a
// database. It uses the sent invoice's frozen copies (D18) for names and bank
// details, and the amount still asked for (amountToAsk), not the printed one.

import { compareDates, toDayNumber, type PlainDate } from "@/lib/billing/dates";
import type { Email } from "@/lib/email";
import { formatDate, formatINR } from "@/lib/format";
import type { InvoiceDocument } from "@/lib/invoices/document";

export function reminderEmail(
  doc: InvoiceDocument,
  input: {
    to: string[];
    kind: "before" | "after";
    today: PlainDate;
    dueDate: PlainDate;
    amountPaise: number;
  },
): Email {
  const amount = formatINR(input.amountPaise);
  const due = formatDate(input.dueDate);
  const overdueDays = toDayNumber(input.today) - toDayNumber(input.dueDate);
  const overdue = input.kind === "after" && overdueDays > 0;
  const dueToday = compareDates(input.today, input.dueDate) === 0;

  const subject = overdue
    ? `Overdue: invoice ${doc.number}, ${amount} was due on ${due}`
    : dueToday
      ? `Reminder: invoice ${doc.number} for ${amount} is due today`
      : `Reminder: invoice ${doc.number} for ${amount} is due on ${due}`;
  const about = `invoice ${doc.number} dated ${doc.invoiceDate} for ${doc.property}`;
  const lines = [
    `Dear ${doc.recipient.name},`,
    "",
    overdue
      ? `Our records show that ${about} is ${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue.`
      : `This is a reminder that ${about} is due ${dueToday ? "today" : `on ${due}`}.`,
    "",
    `Amount to pay: ${amount}`,
    `Due by: ${due}`,
  ];
  const rows = doc.payment?.rows ?? [];
  if (rows.length > 0)
    lines.push(
      "",
      "Pay to:",
      ...rows.map(([label, value]) => `${label}: ${value}`),
    );
  lines.push("", `Please quote ${doc.number} with your payment.`);
  if (overdue)
    lines.push(
      "If you have already paid, please reply with the payment details so we can match it.",
    );
  lines.push("", "Regards,", doc.supplier.name);
  return { to: input.to, subject, text: lines.join("\n") };
}

/** "3 days before the due date", "On the due date", "7 days after the due date", "Sent by hand". */
export function reminderStepWords(step: string | null): string {
  if (!step) return "Sent by hand";
  const [kind, days] = step.split(":");
  const n = Number(days);
  if (n === 0) return "On the due date";
  return `${n} ${n === 1 ? "day" : "days"} ${kind === "before" ? "before" : "after"} the due date`;
}
