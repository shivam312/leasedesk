// "Explain this amount" (docs/UX_PRINCIPLES.md rule 7): the working behind
// each amount on an invoice. Line amounts and their GST come from the
// explanation the engine saved with the line; the total is worked out here
// from the stored figures. Pure.

import { z } from "zod";
import type { Explanation } from "@/lib/billing/types";
import type { invoices } from "@/lib/db/schema";
import { formatINR } from "@/lib/format";

const explanationSchema = z.object({
  rule: z.string(),
  steps: z.array(z.string()),
  result: z.number(),
});

const storedSchema = z.object({
  amount: explanationSchema,
  tax: explanationSchema,
});

/**
 * A line's saved working, or null if it's missing or not in the expected
 * shape: the screen then says so instead of showing something wrong.
 */
export function lineWorking(
  stored: unknown,
): { amount: Explanation; tax: Explanation } | null {
  const parsed = storedSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

type Totals = Pick<
  typeof invoices.$inferSelect,
  | "supplyType"
  | "taxableTotal"
  | "cgstTotal"
  | "sgstTotal"
  | "igstTotal"
  | "roundOff"
  | "grandTotal"
>;

/** "₹1,00,000 + CGST ₹9,000 + SGST ₹9,000 = ₹1,18,000", and the round off. */
export function totalWorking(t: Totals): Explanation {
  const parts = [
    `${formatINR(t.taxableTotal)} before GST`,
    ...(t.supplyType === "inter_state"
      ? [`IGST ${formatINR(t.igstTotal)}`]
      : [`CGST ${formatINR(t.cgstTotal)}`, `SGST ${formatINR(t.sgstTotal)}`]),
  ];
  const beforeRounding = t.grandTotal - t.roundOff;
  const steps = [`${parts.join(" + ")} = ${formatINR(beforeRounding)}`];
  if (t.roundOff !== 0)
    steps.push(
      `Rounded to the nearest rupee: ${formatINR(beforeRounding)} ${t.roundOff > 0 ? "+" : "−"} ${formatINR(Math.abs(t.roundOff))} round off = ${formatINR(t.grandTotal)}`,
    );
  return {
    rule: "Every line's amount plus its GST",
    steps,
    result: t.grandTotal,
  };
}
