// The credit-note form: a reason, an optional note, and the amount before
// GST to take off each invoice line (field `line_<id>`, in rupees). Pure, so
// the browser's preview and the server's save read the form the same way.

import { z } from "zod";
import type { FormState } from "@/lib/auth/forms";
import { rupeesToPaise } from "@/lib/settings/rules-form";
import { CREDIT_REASONS } from "./credit-note-document";
import type { CreditNoteReason } from "./credit-notes";

export const LINE_FIELD = "line_";

const headSchema = z.object({
  invoiceId: z.uuid(),
  reason: z.enum(
    Object.keys(CREDIT_REASONS) as [CreditNoteReason, ...CreditNoteReason[]],
    "Choose why you're issuing the credit note.",
  ),
  note: z
    .string()
    .trim()
    .max(200, "Keep the note under 200 characters.")
    .transform((s) => s || null),
});

/** "1,18,000.50", "₹ 500" or "" (nothing) → paise; null if it isn't an amount. */
export function amountToPaise(text: string): number | null {
  const clean = text.replace(/[₹,\s]/g, "");
  if (clean === "") return 0;
  return rupeesToPaise(clean);
}

/** Paise → the rupee text a field starts with: 1250050 → "12500.50". */
export function paiseToField(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest === 0
    ? String(whole)
    : `${whole}.${String(rest).padStart(2, "0")}`;
}

export type CreditNoteForm = {
  invoiceId: string;
  reason: CreditNoteReason;
  note: string | null;
  lines: { lineId: string; taxablePaise: number }[];
};

export function parseCreditNoteForm(
  entries: Iterable<[string, FormDataEntryValue]>,
): { data: CreditNoteForm } | { state: FormState } {
  const values: Record<string, string> = {};
  for (const [key, value] of entries)
    if (typeof value === "string") values[key] = value;
  const fieldErrors: Record<string, string> = {};
  const head = headSchema.safeParse({
    invoiceId: values.invoiceId,
    reason: values.reason,
    note: values.note ?? "",
  });
  if (!head.success)
    for (const issue of head.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
  const lines: CreditNoteForm["lines"] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(LINE_FIELD)) continue;
    const paise = amountToPaise(value);
    if (paise === null)
      fieldErrors[key] = "Enter an amount in rupees, like 5000 or 5000.50.";
    else
      lines.push({ lineId: key.slice(LINE_FIELD.length), taxablePaise: paise });
  }
  if (!fieldErrors.invoiceId && lines.every((l) => l.taxablePaise === 0))
    fieldErrors.lines = "Enter an amount to credit on at least one line.";
  if (!head.success || Object.keys(fieldErrors).length > 0)
    return {
      state: {
        message: "Check the highlighted fields.",
        fieldErrors,
        values,
      },
    };
  return { data: { ...head.data, lines } };
}
