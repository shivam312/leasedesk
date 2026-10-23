// The payment form: tenant, date received, amount received, TDS deducted,
// how it was paid, and the amount to apply to each unpaid invoice (field
// `apply_<invoice id>`, in rupees). Pure, so the browser's preview and the
// server's save read the form the same way.

import { z } from "zod";
import type { FormState } from "@/lib/auth/forms";
import type { Allocation } from "@/lib/billing/allocation";
import { amountToPaise } from "@/lib/invoices/credit-note-form";
import type { PaymentMode } from "./payments";

export const APPLY_FIELD = "apply_";

export const PAYMENT_MODES: Record<PaymentMode, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

const headSchema = z.object({
  tenantId: z.uuid("Choose the tenant who paid."),
  receivedDate: z.iso.date("Enter the date the money reached your bank."),
  mode: z.enum(
    Object.keys(PAYMENT_MODES) as [PaymentMode, ...PaymentMode[]],
    "Choose how they paid.",
  ),
  reference: z
    .string()
    .trim()
    .max(60, "Keep the reference under 60 characters.")
    .transform((s) => s || null),
  note: z
    .string()
    .trim()
    .max(200, "Keep the note under 200 characters.")
    .transform((s) => s || null),
});

export type PaymentForm = z.output<typeof headSchema> & {
  amountReceivedPaise: number;
  tdsPaise: number;
  allocations: Allocation[];
};

/** Read the payment form; field errors in plain words. */
export function parsePaymentForm(
  entries: Iterable<[string, FormDataEntryValue]>,
): { data: PaymentForm } | { state: FormState } {
  const raw: Record<string, string> = {};
  for (const [k, v] of entries) if (typeof v === "string") raw[k] = v;
  const fieldErrors: Record<string, string> = {};
  const head = headSchema.safeParse({
    tenantId: raw.tenantId ?? "",
    receivedDate: raw.receivedDate ?? "",
    mode: raw.mode ?? "",
    reference: raw.reference ?? "",
    note: raw.note ?? "",
  });
  if (!head.success)
    for (const issue of head.error.issues)
      fieldErrors[String(issue.path[0])] ??= issue.message;

  const received = amountToPaise(raw.amountReceived ?? "");
  if (received === null || received <= 0)
    fieldErrors.amountReceived =
      "Enter the amount received in rupees, like 108000 or 1,08,000.50.";
  const tds = amountToPaise(raw.tds ?? "");
  if (tds === null)
    fieldErrors.tds = "Enter the TDS in rupees, or leave it empty for none.";

  const allocations: Allocation[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(APPLY_FIELD)) continue;
    const invoiceId = key.slice(APPLY_FIELD.length);
    const paise = amountToPaise(value);
    if (paise === null || !z.uuid().safeParse(invoiceId).success) {
      fieldErrors[key] = "Enter an amount in rupees, or 0.";
      continue;
    }
    if (paise > 0) allocations.push({ invoiceId, amountPaise: paise });
  }

  if (Object.keys(fieldErrors).length > 0 || !head.success)
    return { state: { fieldErrors, values: raw } };
  return {
    data: {
      ...head.data,
      amountReceivedPaise: received!,
      tdsPaise: tds!,
      allocations,
    },
  };
}
