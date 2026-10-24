// A tenant's statement: the ledger for one financial year (April–March), from
// the balance brought forward, as a report for the screen and the PDF. Pure.

import {
  compareDates,
  financialYear,
  type PlainDate,
} from "@/lib/billing/dates";
import type { Ledger, LedgerEntry } from "@/lib/billing/ledger";
import { sumPaise, type Paise } from "@/lib/billing/money";
import { formatDate } from "@/lib/format";
import type { Report } from "@/lib/reports/report";

export type LedgerYear = {
  /** "2026-27", or null for everything. */
  financialYear: string | null;
  /** What was owed (positive) or in credit before the year began. */
  openingPaise: Paise;
  entries: LedgerEntry[];
  closingPaise: Paise;
};

/** The April–March dates of "2026-27". */
export function financialYearDates(fy: string): {
  from: PlainDate;
  to: PlainDate;
} {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** "2026-27" if it's a financial year label, else null. */
export function parseFinancialYear(param: unknown): string | null {
  if (typeof param !== "string" || !/^\d{4}-\d{2}$/.test(param)) return null;
  const start = Number(param.slice(0, 4));
  return param.slice(5) === String((start + 1) % 100).padStart(2, "0")
    ? param
    : null;
}

/** The ledger for one financial year, from the balance brought forward. */
export function ledgerForYear(ledger: Ledger, fy: string | null): LedgerYear {
  if (!fy)
    return {
      financialYear: null,
      openingPaise: 0,
      entries: ledger.entries,
      closingPaise: ledger.closingPaise,
    };
  const { from, to } = financialYearDates(fy);
  const before = ledger.entries.filter((e) => compareDates(e.date, from) < 0);
  const openingPaise = before.at(-1)?.balancePaise ?? 0;
  const entries = ledger.entries.filter(
    (e) => compareDates(e.date, from) >= 0 && compareDates(e.date, to) <= 0,
  );
  return {
    financialYear: fy,
    openingPaise,
    entries,
    closingPaise: entries.at(-1)?.balancePaise ?? openingPaise,
  };
}

/** The financial years a statement can be for: this one and the two before. */
export function statementYears(today: PlainDate): string[] {
  const start = financialYear(today).startYear;
  return [0, 1, 2].map(
    (n) => `${start - n}-${String((start - n + 1) % 100).padStart(2, "0")}`,
  );
}

/** The statement as a report (screen and PDF); the balance column is positive when owed. */
export function statementReport(tenantName: string, year: LedgerYear): Report {
  const { from, to } = year.financialYear
    ? financialYearDates(year.financialYear)
    : { from: null, to: null };
  const rows = [
    ...(year.financialYear
      ? [
          {
            date: from,
            what: "Balance brought forward",
            billed: null,
            paid: null,
            balance: year.openingPaise,
          },
        ]
      : []),
    ...year.entries.map((e) => ({
      date: e.date,
      what: e.label,
      billed: e.debitPaise || null,
      paid: e.creditPaise || null,
      balance: e.balancePaise,
    })),
  ];
  return {
    slug: `statement-${year.financialYear ?? "all"}`,
    title: `Statement of account: ${tenantName}`,
    period: year.financialYear
      ? `${formatDate(from!)} to ${formatDate(to!)} (FY ${year.financialYear})`
      : "Everything to date",
    sections: [
      {
        title: "Statement",
        empty: "Nothing billed or paid in this period.",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "what", label: "What", kind: "text" },
          { key: "billed", label: "Billed", kind: "money" },
          { key: "paid", label: "Paid or credited", kind: "money" },
          {
            key: "balance",
            label: "Balance",
            kind: "money",
            hint: "After each line: positive is owed, negative is in credit",
          },
        ],
        rows,
        totals: {
          what: year.closingPaise >= 0 ? "Balance due" : "In credit",
          billed: sumPaise(year.entries.map((e) => e.debitPaise)),
          paid: sumPaise(year.entries.map((e) => e.creditPaise)),
          balance: year.closingPaise,
        },
      },
    ],
    notes: [
      "Sent invoices, credit notes and payments (with the TDS kept back) in date order. Invoices not sent yet aren't included.",
    ],
  };
}
