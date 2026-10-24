"use server";

// The monthly billing run and sending invoices (M4).

import { revalidatePath } from "next/cache";
import { appDb, requireMember, type Member } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { runScoped } from "@/lib/db/scoped";
import { EMAIL_NOT_SET_UP, emailDriver, emailMode } from "@/lib/email";
import {
  emailAgainMessage,
  invoiceIdSchema,
  runMonthSchema,
  runSummary,
  sendSummary,
  type SendAllResult,
} from "@/lib/invoices/forms";
import { creditNoteDocument } from "@/lib/invoices/credit-note-document";
import { parseCreditNoteForm } from "@/lib/invoices/credit-note-form";
import { getCreditNote, issueCreditNote } from "@/lib/invoices/credit-notes";
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
import { todayInIndia } from "@/lib/today";
import { formatINR } from "@/lib/format";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { logActivity } from "@/lib/db/activity-log";
import { guardedForm } from "./guard";
import { reportError } from "@/lib/monitoring";

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
      revalidatePath("/today");
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
      reportError("Send failed", error, { invoiceId });
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
      if (emailMode() === "not_set_up") return { message: EMAIL_NOT_SET_UP };
      const drafts = await runScoped(appDb, member, (s) =>
        draftsForMonth(s, month),
      );
      const result: SendAllResult = { sent: [], alreadySent: 0, problems: [] };
      for (const d of drafts) await sendOne(member, d.id, d.tenantName, result);
      revalidatePath("/billing");
      revalidatePath("/today");
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
      if (emailMode() === "not_set_up") return { message: EMAIL_NOT_SET_UP };
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
      if (emailMode() === "not_set_up") return { message: EMAIL_NOT_SET_UP };
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
            "Only a sent invoice can be emailed again. This one has been credited in full.",
        };
      const email = await emailSent(member, invoiceId, to);
      revalidatePath(`/billing/invoices/${invoiceId}`);
      return emailAgainMessage(email);
    },
  );
}

/**
 * "Issue credit note": number and save it in one transaction, then email its
 * PDF to the tenant's billing contacts (D25, D26).
 */
export async function issueCreditNoteAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    requirePermission(member, "manage_billing");
  } catch (error) {
    if (error instanceof PermissionError) return { message: error.message };
    throw error;
  }
  const parsed = parseCreditNoteForm(form.entries());
  if ("state" in parsed) return parsed.state;
  const input = parsed.data;
  let note;
  try {
    note = await runScoped(appDb, member, (s) =>
      issueCreditNote(s, { ...input, date: todayInIndia() }),
    );
  } catch (error) {
    if (error instanceof SendError)
      return { message: error.message, values: valuesOf(form) };
    reportError("Credit note failed", error, { invoiceId: input.invoiceId });
    return {
      message:
        "Something went wrong; no credit note was issued. Try again in a few minutes.",
      values: valuesOf(form),
    };
  }
  revalidatePath(`/billing/invoices/${input.invoiceId}`);
  revalidatePath("/billing");

  const { doc, to } = await runScoped(appDb, member, async (s) => {
    const saved = await getCreditNote(s, note.id);
    const invoice = saved?.invoice;
    return {
      doc: saved ? creditNoteDocument(saved) : null,
      to: invoice ? await recipientsFor(s, invoice.tenantId) : [],
    };
  });
  const email: EmailResult = doc
    ? await emailInvoice(doc, to, emailDriver(), renderInvoicePdf)
    : { kind: "failed", message: "The credit note couldn't be found." };
  await runScoped(appDb, member, (s) =>
    logActivity(s, {
      entityType: "credit_note_email",
      entityId: note.id,
      action: "send",
      after: email,
    }),
  );
  const issued = `Issued credit note ${note.number} for ${formatINR(note.total)}.`;
  switch (email.kind) {
    case "emailed":
      return {
        message: `${issued} Emailed to ${email.to.join(", ")}.`,
        tone: "success",
      };
    case "no_email":
      return {
        message: `${issued} The tenant has no email address: download the PDF from the invoice page and send it yourself.`,
        tone: "success",
      };
    case "failed":
      return {
        message: `${issued} The email couldn't be sent: download the PDF from the invoice page and send it yourself.`,
        tone: "success",
      };
  }
}

function valuesOf(form: FormData) {
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  return values;
}
