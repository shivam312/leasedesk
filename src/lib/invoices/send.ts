// Sending invoices (docs/BILLING_RULES.md section 9) [CA]. Sending happens in
// two parts:
//
// 1. issueInvoice, in one transaction: lock the draft, take the next number,
//    copy the supplier and tenant details onto it (D18) and mark it sent. If
//    anything fails the transaction rolls back and the number is given back.
// 2. emailInvoice, after that transaction has committed: render the PDF from
//    the frozen copies and email it through the adapter. An email that fails
//    leaves the invoice sent (it already has its number) and is reported, so
//    the user can email it again from the invoice page (D25).

import { and, asc, eq, inArray } from "drizzle-orm";
import { startOfMonth, type YearMonth } from "@/lib/billing/dates";
import { logActivity, updateLogged } from "@/lib/db/activity-log";
import { buildings, invoices, tenantContacts, tenants } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { EmailDriver } from "@/lib/email";
import { EmailError } from "@/lib/email";
import { loadSettings } from "@/lib/settings/store";
import { propertyLine, recipientCopy, supplierCopy } from "./copies";
import type { InvoiceDocument } from "./document";
import { invoiceEmail, invoiceRecipients } from "./email";
import { takeNumber } from "./numbering";
import { getInvoice, leaseUnitCodes } from "./queries";

/** The drafts of a run month, in the order they are numbered. */
export async function draftsForMonth(s: Scoped, runMonth: YearMonth) {
  return s.tx
    .select({ id: invoices.id, tenantName: tenants.companyName })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(buildings, eq(buildings.id, invoices.buildingId))
    .where(
      s.where(
        invoices,
        and(
          eq(invoices.runMonth, startOfMonth(runMonth)),
          eq(invoices.status, "draft"),
        ),
      ),
    )
    .orderBy(asc(buildings.name), asc(tenants.companyName), asc(invoices.id));
}

/** The email addresses an invoice goes to, from the tenant's contacts now. */
export async function recipientsFor(s: Scoped, tenantId: string) {
  const contacts = await s.tx
    .select()
    .from(tenantContacts)
    .where(s.where(tenantContacts, eq(tenantContacts.tenantId, tenantId)));
  return invoiceRecipients(contacts);
}

/** The tenants among a run month's drafts that have no email address to send to. */
export async function draftTenantsWithoutEmail(
  s: Scoped,
  runMonth: YearMonth,
): Promise<string[]> {
  const drafts = await s.tx
    .selectDistinct({ id: tenants.id, name: tenants.companyName })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .where(
      s.where(
        invoices,
        and(
          eq(invoices.runMonth, startOfMonth(runMonth)),
          eq(invoices.status, "draft"),
        ),
      ),
    )
    .orderBy(asc(tenants.companyName));
  if (drafts.length === 0) return [];
  const contacts = await s.tx
    .select()
    .from(tenantContacts)
    .where(
      s.where(
        tenantContacts,
        inArray(
          tenantContacts.tenantId,
          drafts.map((d) => d.id),
        ),
      ),
    );
  return drafts
    .filter(
      (d) =>
        invoiceRecipients(contacts.filter((c) => c.tenantId === d.id))
          .length === 0,
    )
    .map((d) => d.name);
}

export type IssueResult =
  | { kind: "issued"; number: string; to: string[] }
  /** Already sent, perhaps by someone else a moment ago; left as it is. */
  | { kind: "not_draft" };

/**
 * Give one draft its number and mark it sent. Call inside its own runScoped
 * transaction: the invoice row and its series stay locked until it commits.
 */
export async function issueInvoice(
  s: Scoped,
  invoiceId: string,
  sentAt: Date,
): Promise<IssueResult> {
  // Lock the draft first, so two "Send" clicks can't number it twice.
  const [locked] = await s.tx
    .select({ status: invoices.status })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, invoiceId)))
    .for("update");
  if (!locked) throw new Error("That invoice isn't in this organization");
  if (locked.status !== "draft") return { kind: "not_draft" };

  const saved = await getInvoice(s, invoiceId);
  if (!saved) throw new Error("That invoice isn't in this organization");
  const { invoice, tenant, building, entity } = saved;
  if (!entity.gstin)
    throw new SendError(
      `Add the GSTIN for ${entity.legalName} in Settings → Business details, then send again.`,
    );
  const settings = await loadSettings(s, { billingEntityId: entity.id });
  let taken;
  try {
    taken = await takeNumber(s, {
      billingEntityId: entity.id,
      kind: "invoice",
      prefix: building.invoicePrefix,
      date: invoice.invoiceDate,
      format: settings["invoice.numberFormat"],
      startingNumber: settings["invoice.startingNumber"],
    });
  } catch (error) {
    // The number breaks GST rules (too long, or a character not allowed).
    if (error instanceof Error && error.message.startsWith("Invoice number"))
      throw new SendError(
        `The invoice number would be too long or has a character GST doesn't allow. Change ${building.name}'s invoice prefix, then send again.`,
      );
    throw error;
  }
  const { seriesId, number } = taken;
  const to = await recipientsFor(s, tenant.id);
  const property = propertyLine(
    building,
    await leaseUnitCodes(s, invoice.leaseId),
  );
  const updated = await updateLogged(s, invoices, invoice.id, {
    status: "sent",
    seriesId,
    number,
    supplier: supplierCopy(entity),
    recipient: recipientCopy(tenant, property),
    sentAt,
    sentTo: to,
  });
  if (!updated)
    throw new SendError("Only an owner or accounts person can send invoices.");
  await logActivity(s, {
    entityType: "invoices",
    entityId: invoice.id,
    action: "send",
    after: { number, sentTo: to },
  });
  return { kind: "issued", number, to };
}

/** A problem with a message to show the user as it is. */
export class SendError extends Error {}

export type EmailResult =
  | { kind: "emailed"; to: string[] }
  | { kind: "no_email" }
  | { kind: "failed"; message: string };

/**
 * Email a sent invoice's PDF to `to`. Never throws for a failed send: the
 * result says what happened, and the caller logs it.
 */
export async function emailInvoice(
  doc: InvoiceDocument,
  to: string[],
  driver: EmailDriver,
  render: (doc: InvoiceDocument) => Promise<Buffer>,
): Promise<EmailResult> {
  if (to.length === 0) return { kind: "no_email" };
  try {
    const pdf = await render(doc);
    await driver.send(invoiceEmail(doc, to, pdf));
    return { kind: "emailed", to };
  } catch (error) {
    console.error("Invoice email failed", doc.number, error);
    return {
      kind: "failed",
      message:
        error instanceof EmailError
          ? error.message
          : "The email couldn't be sent.",
    };
  }
}

/** Write an email attempt to the activity log. */
export async function logEmail(
  s: Scoped,
  invoiceId: string,
  result: EmailResult,
) {
  await logActivity(s, {
    entityType: "invoice_email",
    entityId: invoiceId,
    action: "send",
    after: result,
  });
}
