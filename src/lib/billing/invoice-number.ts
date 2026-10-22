import { financialYear } from "./dates";
import type { PlainDate } from "./dates";

const MAX_LENGTH = 16;
const ALLOWED = /^[A-Za-z0-9/-]+$/;

/**
 * Formats an invoice number as `{prefix}/{fy}/{seq}`, e.g. `B1/26-27/0001`
 * (docs/BILLING_RULES.md, section 9) [CA]. At most 16 characters of letters,
 * digits, `-` and `/`. Assigning the sequence (gap-free, row-locked) happens
 * in the database layer, not here.
 */
export function invoiceNumber({
  prefix,
  invoiceDate,
  sequence,
}: {
  prefix: string;
  invoiceDate: PlainDate;
  sequence: number;
}): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(
      `Invoice sequence must be a whole number ≥ 1, got ${sequence}`,
    );
  }
  const number = `${prefix}/${financialYear(invoiceDate).short}/${String(sequence).padStart(4, "0")}`;
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
