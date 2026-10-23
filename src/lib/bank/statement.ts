// Reading a bank statement (india-compliance skill, "Bank statement
// import"): which columns hold the date, description, reference and amounts
// (a mapping, saved per bank account after the first import), Indian date
// and amount formats, and the credit lines that can be rent payments.
// Pure: rows of strings in, statement lines out.

import { compareDates, toPlainDate, type PlainDate } from "@/lib/billing/dates";
import type { Paise } from "@/lib/billing/money";

/**
 * Which column (by its header, as printed) holds each field. Amounts are
 * either separate credit and debit columns, or one amount column with a
 * Dr/Cr column beside it.
 */
export type ColumnMapping = {
  date: string;
  description: string;
  reference: string | null;
  credit: string | null;
  debit: string | null;
  amount: string | null;
  drCr: string | null;
};

export type StatementLine = {
  /** Row number in the file, from 1, for messages. */
  row: number;
  date: PlainDate;
  description: string;
  reference: string | null;
  creditPaise: Paise;
  /** Same line imported twice from overlapping statements has the same one. */
  fingerprint: string;
};

/** Header text as compared: lower case, single spaces, no trailing dots or colons. */
export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/g, "")
    .trim();
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * A statement date as YYYY-MM-DD, or null. Accepts DD-MM-YYYY, DD/MM/YYYY,
 * DD.MM.YYYY, DD-Mon-YYYY, "DD Mon YYYY", two-digit years (20xx) and
 * YYYY-MM-DD, with any time after it ignored. Day first, always: Indian
 * banks never print the month first.
 */
export function parseBankDate(text: string): PlainDate | null {
  const t = text
    .trim()
    .split(/\s+(?=\d{1,2}:\d{2})/)[0]!
    .trim();
  let year: number, month: number, day: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if (
    (m = /^(\d{1,2})[-/ ]([A-Za-z]{3,4})[-/ ,]+(\d{2}|\d{4})$/.exec(t))
  ) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    if (!mon) return null;
    [day, month, year] = [Number(m[1]), mon, Number(m[3])];
  } else return null;
  if (year < 100) year += 2000;
  try {
    return toPlainDate(year, month, day);
  } catch {
    return null;
  }
}

/**
 * A statement amount in paise, or null if it isn't one. "1,18,000.00",
 * "₹ 500", "INR 500", "500.00 Cr" all work; empty, "-" and "0" are 0. The
 * sign is returned separately (a debit column may hold "-200"; a negative
 * credit is a reversal, never money received); "Dr"/"Cr" suffixes are
 * returned separately for single-amount statements.
 */
export function parseBankAmount(
  text: string,
): { paise: Paise; side: "cr" | "dr" | null; negative: boolean } | null {
  let t = text
    .trim()
    .replace(/[₹,\s]/g, "")
    .replace(/^inr/i, "");
  let side: "cr" | "dr" | null = null;
  const suffix = /(cr|dr)$/i.exec(t);
  if (suffix) {
    side = suffix[1]!.toLowerCase() as "cr" | "dr";
    t = t.slice(0, -2);
  }
  if (t === "" || t === "-") return { paise: 0, side, negative: false };
  const bracketed = /^\((.*)\)$/.exec(t);
  if (bracketed) t = bracketed[1]!;
  const minus = t.startsWith("-");
  t = t.replace(/^[-+]/, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2})0*)?$/.exec(t);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return {
    paise,
    side,
    negative: paise > 0 && (Boolean(bracketed) || minus),
  };
}

type Field = keyof ColumnMapping;

/** Which field a header most likely is, or null. */
function fieldFor(header: string): Field | null {
  const h = normalizeHeader(header);
  if (
    /^(dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit|type|txn type|cr\/dr indicator)$/.test(
      h,
    )
  )
    return "drCr";
  if (/value date/.test(h)) return null;
  if (/date/.test(h)) return "date";
  if (/narration|description|particulars|remarks|details/.test(h))
    return "description";
  if (/ref|chq|cheque|utr/.test(h)) return "reference";
  if (/deposit|credit|^cr$|^cr amount$/.test(h)) return "credit";
  if (/withdrawal|debit|^dr$|^dr amount$/.test(h)) return "debit";
  if (/amount|amt/.test(h)) return "amount";
  return null;
}

/**
 * The header row of a statement and a mapping guessed from its words, for
 * the user to confirm on the first import. Null if no row looks like a
 * header (a date column and a description, with credits or an amount).
 */
export function suggestMapping(
  rows: readonly string[][],
): { headerRow: number; headers: string[]; mapping: ColumnMapping } | null {
  for (const [index, row] of rows.slice(0, 40).entries()) {
    const found: Partial<Record<Field, string>> = {};
    for (const cell of row) {
      const field = fieldFor(cell);
      if (field && !found[field]) found[field] = cell;
    }
    // A value date is still a date if there's no other.
    if (!found.date) {
      const value = row.find((c) => /value date/.test(normalizeHeader(c)));
      if (value) found.date = value;
    }
    const amounts = found.credit || (found.amount && found.drCr);
    if (found.date && found.description && amounts)
      return {
        headerRow: index,
        headers: row,
        mapping: {
          date: found.date,
          description: found.description,
          reference: found.reference ?? null,
          credit: found.credit ?? null,
          debit: found.debit ?? null,
          amount: found.credit ? null : (found.amount ?? null),
          drCr: found.credit ? null : (found.drCr ?? null),
        },
      };
  }
  return null;
}

/** Why a mapping can't be used, in words for the screen, or null. */
export function mappingProblem(m: ColumnMapping): string | null {
  if (!m.date) return "Choose the column with the transaction date.";
  if (!m.description) return "Choose the column with the description.";
  if (!m.credit && !(m.amount && m.drCr))
    return "Choose the column with money received (credit or deposit), or an amount column and its Dr/Cr column.";
  return null;
}

/**
 * The row holding a saved mapping's headers: the first of the first 40
 * rows that has the date and description headers. Statements put a
 * different number of lines above the table each month.
 */
export function findHeaderRow(
  rows: readonly string[][],
  mapping: ColumnMapping,
): number | null {
  const want = [mapping.date, mapping.description].map(normalizeHeader);
  for (const [index, row] of rows.slice(0, 40).entries()) {
    const have = new Set(row.map(normalizeHeader));
    if (want.every((w) => have.has(w))) return index;
  }
  return null;
}

/**
 * The credit lines of a statement, with debits counted and rows that look
 * like transactions but can't be read reported by row number. Rows without
 * a date (balances, footers) are skipped.
 */
export function readStatement(
  rows: readonly string[][],
  mapping: ColumnMapping,
):
  | {
      lines: StatementLine[];
      debits: number;
      problems: string[];
      periodStart: PlainDate | null;
      periodEnd: PlainDate | null;
    }
  | { error: string } {
  const problem = mappingProblem(mapping);
  if (problem) return { error: problem };
  const headerRow = findHeaderRow(rows, mapping);
  if (headerRow === null)
    return {
      error: `This file has no row with the columns “${mapping.date}” and “${mapping.description}”. Check it's a statement of this account, or set the columns again.`,
    };
  const headers = rows[headerRow]!.map(normalizeHeader);
  const col = (name: string | null) => {
    if (!name) return -1;
    return headers.indexOf(normalizeHeader(name));
  };
  const at = {
    date: col(mapping.date),
    description: col(mapping.description),
    reference: col(mapping.reference),
    credit: col(mapping.credit),
    debit: col(mapping.debit),
    amount: col(mapping.amount),
    drCr: col(mapping.drCr),
  };
  const missing = (Object.keys(at) as Field[]).find(
    (k) => mapping[k] && at[k] < 0,
  );
  if (missing)
    return {
      error: `This file has no “${mapping[missing]}” column. Set the columns again for this statement.`,
    };

  const lines: StatementLine[] = [];
  const problems: string[] = [];
  const seen = new Map<string, number>();
  let debits = 0;
  let periodStart: PlainDate | null = null;
  let periodEnd: PlainDate | null = null;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const cell = (index: number) => (index >= 0 ? (row[index] ?? "") : "");
    const rowNumber = i + 1;
    const dateText = cell(at.date);
    const date = parseBankDate(dateText);
    let credit: Paise = 0;
    let debit: Paise = 0;
    let unreadable: string | null = null;
    if (at.credit >= 0) {
      const c = parseBankAmount(cell(at.credit));
      const d = at.debit >= 0 ? parseBankAmount(cell(at.debit)) : null;
      if (!c || c.negative) unreadable = cell(at.credit);
      else credit = c.paise;
      if (at.debit >= 0 && !d) unreadable ??= cell(at.debit);
      else if (d) debit = d.paise;
    } else {
      const a = parseBankAmount(cell(at.amount));
      const side = normalizeHeader(cell(at.drCr));
      if (!a) unreadable = cell(at.amount);
      else if (/^(cr|c|credit)$/.test(side) || a.side === "cr") {
        if (a.negative) unreadable = `${cell(at.amount)} ${cell(at.drCr)}`;
        else credit = a.paise;
      } else if (/^(dr|d|debit)$/.test(side) || a.side === "dr")
        debit = a.paise;
      else if (a.paise > 0) unreadable = `${cell(at.amount)} ${cell(at.drCr)}`;
    }
    if (!date) {
      if (dateText !== "" && credit > 0)
        problems.push(
          `Row ${rowNumber}: couldn't read the date “${dateText}”, so this credit was left out.`,
        );
      continue;
    }
    if (unreadable !== null) {
      problems.push(
        `Row ${rowNumber}: couldn't read the amount “${unreadable}”, so this row was left out.`,
      );
      continue;
    }
    if (credit === 0) {
      if (debit > 0) debits++;
      continue;
    }
    const description = cell(at.description).replace(/\s+/g, " ");
    const reference = cell(at.reference).trim() || null;
    const key = `${date}|${credit}|${description.toLowerCase()}|${reference ?? ""}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    lines.push({
      row: rowNumber,
      date,
      description,
      reference,
      creditPaise: credit,
      fingerprint: `${key}#${n}`,
    });
    if (!periodStart || compareDates(date, periodStart) < 0) periodStart = date;
    if (!periodEnd || compareDates(date, periodEnd) > 0) periodEnd = date;
  }
  return { lines, debits, problems, periodStart, periodEnd };
}
