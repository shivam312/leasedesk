// The Billing page's month and the words for a billing run's result.

import { z } from "zod";
import { addMonthsToMonth, monthOf, type YearMonth } from "@/lib/billing/dates";
import { formatMonth } from "@/lib/format";
import type { RunResult } from "./run";

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
