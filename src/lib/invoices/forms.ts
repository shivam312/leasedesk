// The Billing page's month and the words for a billing run's result.

import { z } from "zod";
import { addMonthsToMonth, monthOf, type YearMonth } from "@/lib/billing/dates";
import { formatMonth } from "@/lib/format";
import type { RunResult } from "./run";
import type { EmailResult } from "./send";

export const runMonthSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the month to bill."),
});

/** The month shown on the Billing page: `?month=` if valid, else this month. */
export function billingMonth(param: unknown, today: string): YearMonth {
  return typeof param === "string" &&
    runMonthSchema.safeParse({ month: param }).success
    ? param
    : monthOf(today);
}

/** Last month, this month and next month, for the month picker. */
export function monthChoices(
  today: string,
): { value: YearMonth; label: string }[] {
  const now = monthOf(today);
  return [-1, 0, 1].map((n) => {
    const value = addMonthsToMonth(now, n);
    return { value, label: formatMonth(value) };
  });
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * What a run did, e.g. "Made 38 invoices for Nov 2026. Check them, then
 * send.", and one line per lease that needs attention, each with what to do.
 */
export function runSummary(result: RunResult): {
  message: string;
  tone: "success" | "error";
  problems: string[];
} {
  const month = formatMonth(result.runMonth);
  const parts = [
    result.drafted === 0
      ? `No leases need an invoice for ${month}. Check that each lease has started and has its rent set.`
      : `Made ${plural(result.drafted, "invoice", "invoices")} for ${month}. Check them, then send.`,
  ];
  if (result.alreadySent > 0)
    parts.push(
      `${plural(result.alreadySent, "tenant was", "tenants were")} already sent ${month}'s invoice; ${result.alreadySent === 1 ? "it wasn't" : "those weren't"} changed.`,
    );
  return {
    message: parts.join(" "),
    tone:
      result.drafted === 0 && result.problems.length > 0 ? "error" : "success",
    problems: result.problems.map((p) => `${p.tenantName}: ${p.message}`),
  };
}

/**
 * What "Send all" will do, shown before it's confirmed. Names the tenants
 * with no email address, since their invoices are numbered but not emailed.
 */
export function sendAllConsequence(noEmail: string[]): string {
  const base =
    "Each gets its invoice number and is emailed with its PDF to the tenant's billing contacts. Sent invoices can't be changed; corrections are credit notes.";
  if (noEmail.length === 0) return base;
  const who =
    noEmail.length === 1
      ? `${noEmail[0]} has no email address, so its invoice will be numbered but not emailed: download the PDF and send it yourself.`
      : `${noEmail.length} tenants have no email address (${noEmail.join(", ")}), so their invoices will be numbered but not emailed: download the PDFs and send them yourself.`;
  return `${base} ${who}`;
}

export type SendOutcome = {
  tenantName: string;
  number: string;
  email: EmailResult;
};

export type SendAllResult = {
  sent: SendOutcome[];
  /** Drafts someone else sent meanwhile. */
  alreadySent: number;
  /** Drafts that couldn't be sent; they stay not sent yet. */
  problems: { tenantName: string; message: string }[];
};

/**
 * What "Send all" did, e.g. "Sent 42 invoices. 3 tenants have no email
 * address: download their PDFs from the invoice and send them yourself.",
 * with one line per invoice that needs attention.
 */
export function sendSummary(result: SendAllResult): {
  message: string;
  tone: "success" | "error";
  problems: string[];
} {
  const noEmail = result.sent.filter((o) => o.email.kind === "no_email");
  const failed = result.sent.filter((o) => o.email.kind === "failed");
  const parts: string[] = [];
  if (result.sent.length > 0)
    parts.push(`Sent ${plural(result.sent.length, "invoice", "invoices")}.`);
  else if (result.problems.length === 0)
    parts.push(
      result.alreadySent > 0
        ? "These invoices were already sent."
        : "There are no invoices to send.",
    );
  else parts.push("No invoices were sent.");
  if (noEmail.length > 0)
    parts.push(
      `${plural(noEmail.length, "tenant has", "tenants have")} no email address: open the invoice, download the PDF and send it yourself, or add a billing contact on the tenant's page.`,
    );
  if (failed.length > 0)
    parts.push(
      `${plural(failed.length, "email", "emails")} couldn't be sent: open the invoice and choose Email again.`,
    );
  return {
    message: parts.join(" "),
    tone:
      result.sent.length === 0 && result.problems.length > 0
        ? "error"
        : "success",
    problems: [
      ...result.problems.map(
        (p) => `${p.tenantName}: ${p.message} It wasn't sent.`,
      ),
      ...noEmail.map((o) => `${o.tenantName} (${o.number}): no email address.`),
      ...failed.map(
        (o) =>
          `${o.tenantName} (${o.number}): the invoice was sent but the email failed (${o.email.kind === "failed" ? o.email.message.replace(/\.$/, "") : ""}). Open it and choose Email again.`,
      ),
    ],
  };
}

/** What emailing one invoice again did. */
export function emailAgainMessage(result: EmailResult): {
  message: string;
  tone: "success" | "error";
} {
  switch (result.kind) {
    case "emailed":
      return {
        message: `Emailed to ${result.to.join(", ")}.`,
        tone: "success",
      };
    case "no_email":
      return {
        message:
          "This tenant has no email address. Add a billing contact on the tenant's page, or download the PDF and send it yourself.",
        tone: "error",
      };
    case "failed":
      return {
        message: `${result.message} Try again in a few minutes.`,
        tone: "error",
      };
  }
}

export const invoiceIdSchema = z.object({ invoiceId: z.uuid() });
