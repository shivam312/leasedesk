// Invoice and credit-note numbers (docs/BILLING_RULES.md section 9) [CA]:
// pure formatting here; sequence assignment, row-locked and gap-free, is in
// numbering.ts (D9).

import { financialYear } from "@/lib/billing/dates";
import type { PlainDate } from "@/lib/billing/dates";

const MAX_LENGTH = 16;
const ALLOWED = /^[A-Za-z0-9/-]+$/;
export const DEFAULT_NUMBER_FORMAT = "{prefix}/{fy}/{seq}";

/**
 * Formats a number from the billing entity's template (`invoice.numberFormat`,
 * default `{prefix}/{fy}/{seq}`, e.g. `B1/26-27/0001`). `{fy}` is the short
 * financial year and `{seq}` the sequence padded to 4 digits. At most 16
 * characters of letters, digits, `-` and `/`.
 */
export function invoiceNumber({
  format = DEFAULT_NUMBER_FORMAT,
  prefix,
  invoiceDate,
  sequence,
}: {
  format?: string;
  prefix: string;
  invoiceDate: PlainDate;
  sequence: number;
}): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(
      `Invoice sequence must be a whole number ≥ 1, got ${sequence}`,
    );
  }
  const number = format
    .replaceAll("{prefix}", prefix)
    .replaceAll("{fy}", financialYear(invoiceDate).short)
    .replaceAll("{seq}", String(sequence).padStart(4, "0"));
  if (!ALLOWED.test(number)) {
    throw new Error(
      `Invoice number "${number}" may only use letters, digits, - and /`,
    );
  }
  if (number.length > MAX_LENGTH) {
    throw new Error(
      `Invoice number "${number}" is longer than ${MAX_LENGTH} characters`,
    );
  }
  return number;
}

/**
 * The first number of a new series: from `invoice.startingNumber` for that
 * financial year ({"2026-27": 412} for a landlord who has already used 411
 * numbers this year), otherwise 1.
 */
export function firstNumber(
  startingNumber: Record<string, number>,
  invoiceDate: PlainDate,
): number {
  return startingNumber[financialYear(invoiceDate).label] ?? 1;
}
