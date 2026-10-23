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

/** The invoice or credit-note email, with its PDF attached. */
export function invoiceEmail(
  doc: InvoiceDocument,
  to: string[],
  pdf: Buffer,
): Email {
  const creditNote = doc.title === "Credit Note";
  const toPay = doc.payment?.toPay ?? null;
  const lines = [
    `Dear ${doc.recipient.name},`,
    "",
    creditNote
      ? `Please find attached credit note ${doc.number} dated ${doc.invoiceDate} against invoice ${doc.against} for ${doc.property}.`
      : `Please find attached invoice ${doc.number} dated ${doc.invoiceDate} for ${doc.property}.`,
  ];
  // Nothing is asked for on a paid or part-paid invoice (D24): this is a copy.
  if (toPay)
    lines.push("", `Amount to pay: ${toPay}`, `Due by: ${doc.dueDate}`);
  else
    lines.push(
      "",
      `${creditNote ? "Credit note" : "Invoice"} total: ${doc.totals.at(-1)!.amount}`,
    );
  if (doc.reason) lines.push(`Reason: ${doc.reason}`);
  if (toPay && doc.payment!.rows.length > 0)
    lines.push(
      "",
      "Pay to:",
      ...doc.payment!.rows.map(([label, value]) => `${label}: ${value}`),
    );
  if (toPay) lines.push("", `Please quote ${doc.number} with your payment.`);
  lines.push("", "Regards,", doc.supplier.name);
  return {
    to,
    subject: creditNote
      ? `Credit note ${doc.number} from ${doc.supplier.name} against invoice ${doc.against?.split(" ")[0]}`
      : `Invoice ${doc.number} from ${doc.supplier.name}, due ${doc.dueDate}`,
    text: lines.join("\n"),
    attachments: [
      { filename: pdfFileName(doc.number, creditNote), content: pdf },
    ],
  };
}
