"use server";

// The monthly billing run and sending invoices (M4).

import { revalidatePath } from "next/cache";
import { appDb, type Member } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { runScoped } from "@/lib/db/scoped";
import { emailDriver } from "@/lib/email";
import {
  emailAgainMessage,
  invoiceIdSchema,
  runMonthSchema,
  runSummary,
  sendSummary,
  type SendAllResult,
} from "@/lib/invoices/forms";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { getInvoice, getInvoiceDocument } from "@/lib/invoices/queries";
import { runBilling } from "@/lib/invoices/run";
import {
  draftsForMonth,
  emailInvoice,
  issueInvoice,
  logEmail,
  recipientsFor,
  SendError,
  type EmailResult,
} from "@/lib/invoices/send";
import { guardedForm } from "./guard";

/** "Make invoices": draft every lease's invoice for the chosen month. */
export async function runBillingNow(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    runMonthSchema,
    form,
    async (member, { month }) => {
      const result = await runScoped(appDb, member, (s) =>
        runBilling(s, month),
      );
      revalidatePath("/billing");
      return runSummary(result);
    },
  );
}

/** Number one draft in its own transaction, then email it (D25). */
async function sendOne(
  member: Member,
  invoiceId: string,
  tenantName: string,
  result: SendAllResult,
) {
  let issued;
  try {
    issued = await runScoped(appDb, member, (s) =>
      issueInvoice(s, invoiceId, new Date()),
    );
  } catch (error) {
    if (!(error instanceof SendError))
      console.error("Send failed", invoiceId, error);
    result.problems.push({
      tenantName,
      message:
        error instanceof SendError
          ? error.message
          : "Something went wrong while sending. Try again in a few minutes.",
    });
    return;
  }
  if (issued.kind === "not_draft") {
    result.alreadySent += 1;
    return;
  }
  const email = await emailSent(member, invoiceId, issued.to);
  result.sent.push({ tenantName, number: issued.number, email });
}

/** Email a sent invoice's PDF, printed from its frozen copies, and log it. */
async function emailSent(
  member: Member,
  invoiceId: string,
  to: string[],
): Promise<EmailResult> {
  const doc = await runScoped(appDb, member, (s) =>
    getInvoiceDocument(s, invoiceId),
  );
  const email = doc
    ? await emailInvoice(doc, to, emailDriver(), renderInvoicePdf)
    : ({ kind: "failed", message: "The invoice couldn't be found." } as const);
  await runScoped(appDb, member, (s) => logEmail(s, invoiceId, email));
  return email;
}

/** "Send all": number and email every draft of the month. */
export async function sendAllInvoices(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    runMonthSchema,
    form,
    async (member, { month }) => {
      const drafts = await runScoped(appDb, member, (s) =>
        draftsForMonth(s, month),
      );
      const result: SendAllResult = { sent: [], alreadySent: 0, problems: [] };
      for (const d of drafts) await sendOne(member, d.id, d.tenantName, result);
      revalidatePath("/billing");
      return sendSummary(result);
    },
  );
}

/** Send one draft from its own page. */
export async function sendInvoice(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    invoiceIdSchema,
    form,
    async (member, { invoiceId }) => {
      const saved = await runScoped(appDb, member, (s) =>
        getInvoiceDocument(s, invoiceId),
      );
      if (!saved) return { message: "That invoice couldn't be found." };
      const result: SendAllResult = { sent: [], alreadySent: 0, problems: [] };
      await sendOne(member, invoiceId, saved.recipient.name, result);
      revalidatePath("/billing");
      revalidatePath(`/billing/invoices/${invoiceId}`);
      const summary = sendSummary(result);
      const sent = result.sent[0];
      if (sent?.email.kind === "emailed")
        return {
          message: `Sent as ${sent.number} to ${sent.email.to.join(", ")}.`,
          tone: "success",
        };
      return {
        message: [summary.message, ...summary.problems].join(" "),
        tone: summary.tone,
      };
    },
  );
}

/** "Email again": a sent invoice, to the tenant's billing contacts now. */
export async function emailInvoiceAgain(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    invoiceIdSchema,
    form,
    async (member, { invoiceId }) => {
      const to = await runScoped(appDb, member, async (s) => {
        const saved = await getInvoice(s, invoiceId);
        if (
          !saved ||
          saved.invoice.status === "draft" ||
          saved.invoice.status === "cancelled"
        )
          return null;
        return recipientsFor(s, saved.invoice.tenantId);
      });
      if (!to)
        return {
          message:
            "Only a sent invoice can be emailed. A cancelled invoice isn't emailed again.",
        };
      const email = await emailSent(member, invoiceId, to);
      revalidatePath(`/billing/invoices/${invoiceId}`);
      return emailAgainMessage(email);
    },
  );
}
