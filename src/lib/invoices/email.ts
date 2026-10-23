// Who an invoice is emailed to, and what the email says. Pure, so the words
// and the choice of addresses are tested without a database.

import type { tenantContacts } from "@/lib/db/schema";
import type { Email } from "@/lib/email";
import { pdfFileName, type InvoiceDocument } from "./document";

type Contact = Pick<
  typeof tenantContacts.$inferSelect,
  "email" | "role" | "isPrimary"
>;

/**
 * The tenant's billing contacts with an email address; if there are none,
 * the primary contact's. Lower-cased, each address once.
 */
export function invoiceRecipients(contacts: Contact[]): string[] {
  const withEmail = contacts.filter((c) => c.email?.trim());
  const billing = withEmail.filter((c) => c.role === "billing");
  const chosen =
    billing.length > 0 ? billing : withEmail.filter((c) => c.isPrimary);
  return [...new Set(chosen.map((c) => c.email!.trim().toLowerCase()))];
}

/** The invoice email, with its PDF attached. */
export function invoiceEmail(
  doc: InvoiceDocument,
  to: string[],
  pdf: Buffer,
): Email {
  const lines = [
    `Dear ${doc.recipient.name},`,
    "",
    `Please find attached invoice ${doc.number} dated ${doc.invoiceDate} for ${doc.property}.`,
  ];
  // Nothing is asked for on a paid or part-paid invoice (D24): this is a copy.
  if (doc.payment.toPay)
    lines.push(
      "",
      `Amount to pay: ${doc.payment.toPay}`,
      `Due by: ${doc.dueDate}`,
    );
  else lines.push("", `Invoice total: ${doc.totals.at(-1)!.amount}`);
  if (doc.payment.toPay && doc.payment.rows.length > 0)
    lines.push(
      "",
      "Pay to:",
      ...doc.payment.rows.map(([label, value]) => `${label}: ${value}`),
    );
  if (doc.payment.toPay)
    lines.push("", `Please quote ${doc.number} with your payment.`);
  lines.push("", "Regards,", doc.supplier.name);
  return {
    to,
    subject: `Invoice ${doc.number} from ${doc.supplier.name}, due ${doc.dueDate}`,
    text: lines.join("\n"),
    attachments: [{ filename: pdfFileName(doc.number), content: pdf }],
  };
}
