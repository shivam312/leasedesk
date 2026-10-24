// Tenant contacts: who receives invoices, and the rule that a change never
// leaves a tenant who had an invoice email without one. Pure.

import { invoiceRecipients } from "@/lib/invoices/email";
import type { tenantContacts } from "@/lib/db/schema";

export type ContactRow = Pick<
  typeof tenantContacts.$inferSelect,
  "id" | "name" | "email" | "role" | "isPrimary"
>;

/** Whether invoices and reminders go to this contact (the same choice as sending makes). */
export function receivesInvoices(
  contact: ContactRow,
  contacts: readonly ContactRow[],
): boolean {
  const email = contact.email?.trim().toLowerCase();
  return !!email && invoiceRecipients([...contacts]).includes(email);
}

/**
 * Why a change to the contacts isn't allowed, or null: it would leave no
 * email to send invoices to, where there was one before.
 */
export function contactsChangeProblem(
  before: readonly ContactRow[],
  after: readonly ContactRow[],
): string | null {
  if (invoiceRecipients([...before]).length === 0) return null;
  if (invoiceRecipients([...after]).length > 0) return null;
  return "Invoices would have no email to go to. Give another contact an email and the Accounts role first.";
}

/** After removing the main contact: the next one to make main (one with an email first), or null. */
export function nextPrimary(remaining: readonly ContactRow[]): string | null {
  const withEmail = remaining.find((c) => c.email?.trim());
  return (withEmail ?? remaining[0])?.id ?? null;
}
