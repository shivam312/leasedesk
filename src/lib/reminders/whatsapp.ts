// The one-tap WhatsApp reminder: a wa.me link that opens a chat with the
// tenant's WhatsApp contact, with the message filled in. The person still
// presses Send in WhatsApp; nothing is sent from here (the WhatsApp Business
// API is v2). Pure, so the words are tested without a database.

import { compareDates, toDayNumber, type PlainDate } from "@/lib/billing/dates";
import type { tenantContacts } from "@/lib/db/schema";
import { formatDate, formatINR } from "@/lib/format";
import type { InvoiceDocument } from "@/lib/invoices/document";

type Contact = Pick<
  typeof tenantContacts.$inferSelect,
  "name" | "phone" | "whatsapp" | "role" | "isPrimary"
>;

/**
 * Who to message: a contact marked as on WhatsApp with a phone number, the
 * accounts contact first, then the primary contact, then anyone.
 */
export function whatsappRecipient(
  contacts: Contact[],
): { name: string; phone: string } | null {
  const onWhatsapp = contacts.filter((c) => c.whatsapp && c.phone?.trim());
  const chosen =
    onWhatsapp.find((c) => c.role === "billing") ??
    onWhatsapp.find((c) => c.isPrimary) ??
    onWhatsapp[0];
  return chosen ? { name: chosen.name, phone: chosen.phone!.trim() } : null;
}

/** The message: short, with the amount, due date, invoice number and bank details. */
export function whatsappText(
  doc: InvoiceDocument,
  input: { today: PlainDate; dueDate: PlainDate; amountPaise: number },
): string {
  const amount = formatINR(input.amountPaise);
  const due = formatDate(input.dueDate);
  const late = toDayNumber(input.today) - toDayNumber(input.dueDate);
  const about = `invoice ${doc.number} for ${amount}`;
  const lines = [
    `Dear ${doc.recipient.name},`,
    "",
    late > 0
      ? `A reminder that ${about} was due on ${due} (${late} ${late === 1 ? "day" : "days"} ago).`
      : compareDates(input.today, input.dueDate) === 0
        ? `A reminder that ${about} is due today.`
        : `A reminder that ${about} is due on ${due}.`,
  ];
  const rows = doc.payment?.rows ?? [];
  if (rows.length > 0)
    lines.push("", ...rows.map(([label, value]) => `${label}: ${value}`));
  lines.push(
    "",
    `Please quote ${doc.number} with your payment. If you have already paid, please reply with the payment date and reference.`,
    "",
    doc.supplier.name,
  );
  return lines.join("\n");
}

/** https://wa.me/<number without +>?text=<message> */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
