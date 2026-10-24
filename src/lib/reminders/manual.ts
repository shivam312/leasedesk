// Reminders a person sends from the invoice page or Today: the one-tap
// WhatsApp link, for an invoice or a tenant's opening balance (D-028). The
// link is worked out here from what is owed now, and each tap is recorded as
// a reminder with the person who sent it (step null).

import { eq } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import { insertLogged } from "@/lib/db/activity-log";
import {
  invoices,
  openingBalances,
  organizations,
  reminders,
  tenantContacts,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { getInvoiceDocument } from "@/lib/invoices/queries";
import { unpaidInvoices } from "@/lib/payments/payments";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { amountToAsk } from "./schedule";
import {
  openingBalanceWhatsappText,
  whatsappLink,
  whatsappRecipient,
  whatsappText,
} from "./whatsapp";

/** The landlord's name for a reminder about an opening balance. */
export async function landlordName(s: Scoped): Promise<string> {
  const [org] = await s.tx
    .select({ name: organizations.name, legalName: organizations.legalName })
    .from(organizations)
    .where(eq(organizations.id, s.organizationId));
  return org?.legalName || org?.name || "";
}

/** The tenant an opening balance belongs to, or null if `id` isn't one. */
async function openingBalanceTenant(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({ tenantId: openingBalances.tenantId, name: tenants.companyName })
    .from(openingBalances)
    .innerJoin(tenants, eq(tenants.id, openingBalances.tenantId))
    .where(s.where(openingBalances, eq(openingBalances.id, id)));
  return row ?? null;
}

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

/**
 * The WhatsApp reminder for an invoice (or a tenant's opening balance, by
 * its id) today, from what is owed now.
 */
export async function whatsappReminder(
  s: Scoped,
  invoiceId: string,
  today: PlainDate,
): Promise<WhatsappReminder> {
  const opening = await openingBalanceTenant(s, invoiceId);
  if (opening) return openingWhatsappReminder(s, invoiceId, opening);
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

async function openingWhatsappReminder(
  s: Scoped,
  id: string,
  tenant: { tenantId: string; name: string },
): Promise<WhatsappReminder> {
  const settings = billingSettings(
    await loadSettings(s, { tenantId: tenant.tenantId }),
  );
  const open = (await unpaidInvoices(s, tenant.tenantId, settings)).find(
    (u) => u.id === id,
  );
  const amountPaise = open ? amountToAsk(open) : 0;
  if (!open || amountPaise === 0) return { kind: "nothing_to_ask" };
  const to = whatsappRecipient(
    await s.tx
      .select()
      .from(tenantContacts)
      .where(
        s.where(tenantContacts, eq(tenantContacts.tenantId, tenant.tenantId)),
      ),
  );
  if (!to) return { kind: "no_number" };
  return {
    kind: "ready",
    url: whatsappLink(
      to.phone,
      openingBalanceWhatsappText({
        tenantName: tenant.name,
        landlordName: await landlordName(s),
        asOnDate: open.dueDate,
        amountPaise,
      }),
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
  const opening = await openingBalanceTenant(s, invoiceId);
  return insertLogged(s, reminders, {
    invoiceId: opening ? null : invoiceId,
    openingBalanceId: opening ? invoiceId : null,
    channel: "whatsapp_link",
    step: null,
    amountAsked: reminder.amountPaise,
    sentBy: s.userId,
    sentTo: [reminder.phone],
    status: "sent",
  });
}
