// Forms for bank accounts and statement imports. The import form carries the
// rows the browser read from the file (JSON) and the chosen columns; the
// server reads the rows again itself, so nothing the browser worked out is
// trusted.

import { z } from "zod";
import type { FormState } from "@/lib/auth/forms";
import type { ColumnMapping } from "./statement";

export const bankAccountSchema = z.object({
  billingEntityId: z.uuid("Choose whose account it is."),
  bankName: z
    .string()
    .trim()
    .min(2, "Enter the bank's name, e.g. HDFC Bank.")
    .max(60, "Keep the bank's name under 60 characters."),
  accountLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter the last 4 digits of the account number."),
});

const column = z
  .string()
  .max(200)
  .transform((s) => s || null);

const importSchema = z.object({
  bankAccountId: z.uuid("Choose the bank account."),
  fileName: z
    .string()
    .trim()
    .min(1, "Choose the statement file.")
    .max(200)
    .transform((s) => s.split(/[\\/]/).pop()!),
  rows: z
    .string()
    .min(2, "Choose the statement file.")
    .transform((text, ctx) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "The file couldn't be read." });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z.array(z.string().max(2000)).max(60),
          "The file couldn't be read.",
        )
        .min(1, "The file is empty.")
        .max(
          20_000,
          "That's more than 20,000 rows. Split the statement by month.",
        ),
    ),
  date: z.string().min(1, "Choose the column with the transaction date."),
  description: z.string().min(1, "Choose the column with the description."),
  reference: column,
  credit: column,
  debit: column,
  amount: column,
  drCr: column,
});

export type ImportForm = {
  bankAccountId: string;
  fileName: string;
  rows: string[][];
  mapping: ColumnMapping;
};

export function parseImportForm(
  form: FormData,
): { data: ImportForm } | { state: FormState } {
  const raw = Object.fromEntries(
    [...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]),
  );
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return {
      state: {
        message: Object.values(fieldErrors)[0],
        fieldErrors,
      },
    };
  }
  const d = parsed.data;
  return {
    data: {
      bankAccountId: d.bankAccountId,
      fileName: d.fileName,
      rows: d.rows,
      mapping: {
        date: d.date,
        description: d.description,
        reference: d.reference,
        credit: d.credit,
        debit: d.debit,
        amount: d.amount,
        drCr: d.drCr,
      },
    },
  };
}
