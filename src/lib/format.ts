/**
 * Indian formats for the UI: ₹ with lakh/crore grouping, DD-MM-YYYY dates,
 * April–March financial years. Display only — never parse these back.
 *
 * Money comes in as integer paise; dates as plain `YYYY-MM-DD` strings.
 * Nothing here uses floats or `Date`, so there is no rounding or time-zone drift.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `formatINR(11800000)` → `₹1,18,000`; `formatINR(11800050)` → `₹1,18,000.50`.
 * Whole rupees have no decimals. Negative amounts show as `-₹1,200`.
 */
export function formatINR(paise: number | bigint): string {
  if (typeof paise === "number" && !Number.isSafeInteger(paise)) {
    throw new RangeError(
      `formatINR expects whole paise as a safe integer, got ${paise}`,
    );
  }
  const value = BigInt(paise);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = groupIndian((abs / 100n).toString());
  const rest = abs % 100n;
  const decimals = rest === 0n ? "" : `.${rest.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}₹${rupees}${decimals}`;
}

/** `"1234567"` → `"12,34,567"`: last three digits, then pairs. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const pairs = head.replace(/\B(?=(\d{2})+$)/g, ",");
  return `${pairs},${digits.slice(-3)}`;
}

/** `"2026-10-22"` → `"22-10-2026"`. */
export function formatDate(date: string): string {
  const { year, month, day } = parsePlainDate(date);
  return `${pad2(day)}-${pad2(month)}-${year}`;
}

/** `"2026-10-22"` or `"2026-10"` → `"Oct 2026"`. */
export function formatMonth(dateOrMonth: string): string {
  const { year, month } = /^\d{4}-\d{2}$/.test(dateOrMonth)
    ? parsePlainDate(`${dateOrMonth}-01`)
    : parsePlainDate(dateOrMonth);
  return `${MONTHS[month - 1]} ${year}`;
}

/** `"2026-10-22"` → `"FY 2026-27"`; `"2026-03-31"` → `"FY 2025-26"`. */
export function formatFinancialYear(date: string): string {
  const { year, month } = parsePlainDate(date);
  const start = month >= 4 ? year : year - 1;
  return `FY ${start}-${pad2((start + 1) % 100)}`;
}

// TODO(M1): switch to the plain-date parser in src/lib/billing/dates.ts once it exists.
function parsePlainDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Not a real date: "${date}"`);
  }
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Area in hundredths of a sq ft: `formatArea(125050)` → `1,250.50 sq ft`. */
export function formatArea(hundredths: number): string {
  return `${formatINR(hundredths).replace("₹", "")} sq ft`;
}
