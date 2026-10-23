// Reminders a person sends from the invoice page: the one-tap WhatsApp link.
// The link is worked out here from what is owed now, and each tap is
// recorded as a reminder with the person who sent it (step null).

import { eq } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import { insertLogged } from "@/lib/db/activity-log";
import { invoices, reminders, tenantContacts } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { getInvoiceDocument } from "@/lib/invoices/queries";
import { unpaidInvoices } from "@/lib/payments/payments";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { amountToAsk } from "./schedule";
import { whatsappLink, whatsappRecipient, whatsappText } from "./whatsapp";

export type WhatsappReminder =
  | {
      kind: "ready";
      url: string;
      contactName: string;
      phone: string;
      amountPaise: number;
    }
  /** A draft or cancelled invoice, or nothing left to ask (paid, or only TDS left). */
  | { kind: "nothing_to_ask" }
  /** No contact is marked as on WhatsApp with a phone number. */
  | { kind: "no_number" };

/** The WhatsApp reminder for an invoice today, from what is owed now. */
export async function whatsappReminder(
  s: Scoped,
  invoiceId: string,
  today: PlainDate,
): Promise<WhatsappReminder> {
  const [invoice] = await s.tx
    .select({ tenantId: invoices.tenantId, status: invoices.status })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, invoiceId)));
  if (!invoice || invoice.status === "draft" || invoice.status === "cancelled")
    return { kind: "nothing_to_ask" };
  const settings = billingSettings(
    await loadSettings(s, { tenantId: invoice.tenantId }),
  );
  const open = (await unpaidInvoices(s, invoice.tenantId, settings)).find(
    (u) => u.id === invoiceId,
  );
  const amountPaise = open ? amountToAsk(open) : 0;
  if (!open || amountPaise === 0) return { kind: "nothing_to_ask" };
  const to = whatsappRecipient(
    await s.tx
      .select()
      .from(tenantContacts)
      .where(
        s.where(tenantContacts, eq(tenantContacts.tenantId, invoice.tenantId)),
      ),
  );
  if (!to) return { kind: "no_number" };
  const doc = await getInvoiceDocument(s, invoiceId);
  if (!doc) return { kind: "nothing_to_ask" };
  return {
    kind: "ready",
    url: whatsappLink(
      to.phone,
      whatsappText(doc, { today, dueDate: open.dueDate, amountPaise }),
    ),
    contactName: to.name,
    phone: to.phone,
    amountPaise,
  };
}

/**
 * Record that the signed-in person opened the WhatsApp reminder. Returns
 * what was recorded, or null when there was nothing to remind about.
 */
export async function recordWhatsappReminder(
  s: Scoped,
  invoiceId: string,
  today: PlainDate,
) {
  const reminder = await whatsappReminder(s, invoiceId, today);
  if (reminder.kind !== "ready") return null;
  return insertLogged(s, reminders, {
    invoiceId,
    channel: "whatsapp_link",
    step: null,
    amountAsked: reminder.amountPaise,
    sentBy: s.userId,
    sentTo: [reminder.phone],
    status: "sent",
  });
}
