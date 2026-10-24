// The "Record a deposit entry" form on a lease. Pure.

import { z } from "zod";
import { amountToPaise } from "@/lib/invoices/credit-note-form";

/** The entries a person records (using it for unpaid rent waits on D-034). */
export const DEPOSIT_KINDS = {
  received: "Received from the tenant",
  refunded: "Refunded to the tenant",
  forfeited: "Kept (forfeited)",
} as const;

/** Every kind's words, for showing entries. */
export const DEPOSIT_KIND_WORDS = {
  ...DEPOSIT_KINDS,
  adjusted: "Used for unpaid rent",
} as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null);

export const depositEntrySchema = z.object({
  kind: z.enum(
    Object.keys(DEPOSIT_KINDS) as [
      keyof typeof DEPOSIT_KINDS,
      ...(keyof typeof DEPOSIT_KINDS)[],
    ],
    "Choose what happened.",
  ),
  date: z.iso.date("Choose the date."),
  amount: z
    .string()
    .transform((v) => amountToPaise(v))
    .refine(
      (p): p is number => p !== null && p > 0,
      "Enter the amount in rupees, like 3,00,000.",
    ),
  reference: text(80),
  note: text(200),
});
