// The "Opening balance" form on a tenant page (D-028: A). Pure.

import { z } from "zod";
import { amountToPaise } from "@/lib/invoices/credit-note-form";

export const openingBalanceSchema = z.object({
  amount: z
    .string()
    .transform((v) => amountToPaise(v))
    .refine(
      (p): p is number => p !== null && p > 0,
      "Enter the amount owed in rupees, like 1,25,000.",
    ),
  asOnDate: z.iso.date("Choose the date it was owed on."),
  note: z
    .string()
    .trim()
    .max(200, "Keep the note under 200 characters.")
    .transform((s) => s || null),
});
