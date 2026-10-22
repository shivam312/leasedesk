/**
 * Plain-date helpers for the billing engine (docs/BILLING_RULES.md, section 1).
 *
 * Dates are `YYYY-MM-DD` strings and months are `YYYY-MM` strings. No `Date`
 * objects, no time zones, no clock: day arithmetic uses a day number
 * (days since 1970-01-01 in the proleptic Gregorian calendar).
 */

export type PlainDate = string;
export type YearMonth = string;

export type DateParts = { year: number; month: number; day: number };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDate(date: PlainDate): DateParts {
  const match = DATE_RE.exec(date);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Not a real date: "${date}"`);
  }
  return { year, month, day };
}

export function toPlainDate(
  year: number,
  month: number,
  day: number,
): PlainDate {
  const date = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
  parseDate(date);
  return date;
}

/** Days since 1970-01-01 (Howard Hinnant's days_from_civil). */
export function toDayNumber(date: PlainDate): number {
  const { year, month, day } = parseDate(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

export function fromDayNumber(dayNumber: number): PlainDate {
  const z = dayNumber + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36_524) -
      Math.floor(doe / 146_096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return toPlainDate(year, month, day);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Days from `from` to `to`, counting both ends. 16–30 Sep = 15. */
export function daysBetweenInclusive(from: PlainDate, to: PlainDate): number {
  const days = toDayNumber(to) - toDayNumber(from) + 1;
  if (days < 1) throw new RangeError(`${to} is before ${from}`);
  return days;
}

export function compareDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  const diff = toDayNumber(a) - toDayNumber(b);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function minDate(a: PlainDate, b: PlainDate): PlainDate {
  return compareDates(a, b) <= 0 ? a : b;
}

export function maxDate(a: PlainDate, b: PlainDate): PlainDate {
  return compareDates(a, b) >= 0 ? a : b;
}

/**
 * Same day `months` later. When that day doesn't exist in the target month,
 * rolls forward to the 1st of the next month (docs/BILLING_RULES.md,
 * section 1): 31 Jan + 1 month = 1 Mar; 29 Feb 2028 + 12 months = 1 Mar 2029.
 * Going backwards to a day that doesn't exist has no rule, so it throws.
 */
export function addMonths(date: PlainDate, months: number): PlainDate {
  const { year, month, day } = parseDate(date);
  const index = year * 12 + (month - 1) + months;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  if (day <= daysInMonth(newYear, newMonth)) {
    return toPlainDate(newYear, newMonth, day);
  }
  if (months < 0) {
    throw new RangeError(
      `${date} minus ${-months} months: day ${day} doesn't exist in ${newYear}-${pad2(newMonth)}`,
    );
  }
  return addDays(
    toPlainDate(newYear, newMonth, daysInMonth(newYear, newMonth)),
    1,
  );
}

export function monthOf(date: PlainDate): YearMonth {
  return date.slice(0, 7);
}

function parseMonth(month: YearMonth): { year: number; month: number } {
  const match = MONTH_RE.exec(month);
  const m = match ? Number(match[2]) : 0;
  if (!match || m < 1 || m > 12) {
    throw new RangeError(`Expected a YYYY-MM month, got "${month}"`);
  }
  return { year: Number(match[1]), month: m };
}

export function startOfMonth(month: YearMonth): PlainDate {
  const { year, month: m } = parseMonth(month);
  return toPlainDate(year, m, 1);
}

export function endOfMonth(month: YearMonth): PlainDate {
  const { year, month: m } = parseMonth(month);
  return toPlainDate(year, m, daysInMonth(year, m));
}

export function daysInYearMonth(month: YearMonth): number {
  const { year, month: m } = parseMonth(month);
  return daysInMonth(year, m);
}

export function addMonthsToMonth(month: YearMonth, months: number): YearMonth {
  return monthOf(addMonths(startOfMonth(month), months));
}

/** Every calendar month that the range touches, in order. */
export function monthsBetween(from: PlainDate, to: PlainDate): YearMonth[] {
  if (compareDates(to, from) < 0)
    throw new RangeError(`${to} is before ${from}`);
  const months: YearMonth[] = [];
  for (let m = monthOf(from); m <= monthOf(to); m = addMonthsToMonth(m, 1)) {
    months.push(m);
  }
  return months;
}

/** April–March financial year. 2026-10-22 → 2026-27. */
export function financialYear(date: PlainDate): {
  startYear: number;
  label: string;
  short: string;
} {
  const { year, month } = parseDate(date);
  const startYear = month >= 4 ? year : year - 1;
  const end = pad2((startYear + 1) % 100);
  return {
    startYear,
    label: `${startYear}-${end}`,
    short: `${pad2(startYear % 100)}-${end}`,
  };
}

/** FY quarter: 1 = Apr–Jun, 2 = Jul–Sep, 3 = Oct–Dec, 4 = Jan–Mar. */
export function fyQuarter(date: PlainDate): {
  fyStartYear: number;
  quarter: 1 | 2 | 3 | 4;
  start: PlainDate;
  end: PlainDate;
} {
  const { year, month } = parseDate(date);
  const fyStartYear = month >= 4 ? year : year - 1;
  const quarter = (Math.floor(((month + 8) % 12) / 3) + 1) as 1 | 2 | 3 | 4;
  const firstMonth = (((quarter - 1) * 3 + 3) % 12) + 1; // 4, 7, 10, 1
  const startYear = quarter === 4 ? fyStartYear + 1 : fyStartYear;
  const start = toPlainDate(startYear, firstMonth, 1);
  return { fyStartYear, quarter, start, end: addDays(addMonths(start, 3), -1) };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
