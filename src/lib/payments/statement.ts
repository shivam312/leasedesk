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
import { depositSettlement } from "@/lib/billing/deposit";
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

/**
 * The deposit settlement statement at a tenant's exit: the lease's unpaid
 * invoices (each at what the tenant is asked to pay, after the TDS they may
 * keep back), less any payment credit the tenant already holds (an earlier
 * overpayment not yet applied), then the deposit held, and what's left to
 * refund or still owed. It records nothing (using a deposit for dues waits
 * on D-034).
 */
export function settlementReport(input: {
  tenantName: string;
  property: string;
  asOf: PlainDate;
  heldPaise: Paise;
  /** The tenant's payment credit not yet applied to invoices (paymentsWithCredit). */
  creditPaise?: Paise;
  unpaid: readonly {
    number: string;
    dueDate: PlainDate;
    outstandingPaise: Paise;
    toPayPaise: Paise;
  }[];
}): {
  report: Report;
  settlement: ReturnType<typeof depositSettlement> & {
    /** The part of the dues the tenant's credit settles, before the deposit. */
    creditUsedPaise: Paise;
    /** Credit beyond the dues: the tenant's money too, to pay back with the deposit. */
    creditLeftPaise: Paise;
  };
} {
  const duesPaise = sumPaise(input.unpaid.map((u) => u.toPayPaise));
  const creditPaise = Math.max(0, input.creditPaise ?? 0);
  // Credit the tenant already paid settles the dues first; the deposit
  // covers only what's left, so the refund isn't understated. Credit beyond
  // the dues is still theirs and is shown as also to pay back.
  const creditUsedPaise = Math.min(creditPaise, duesPaise);
  const creditLeftPaise = creditPaise - creditUsedPaise;
  const netDuesPaise = duesPaise - creditUsedPaise;
  const settlement = {
    creditUsedPaise,
    creditLeftPaise,
    ...depositSettlement(input.heldPaise, netDuesPaise),
  };
  const report: Report = {
    slug: `deposit-settlement-${input.asOf}`,
    title: `Deposit settlement: ${input.tenantName}`,
    period: `${input.property}, as on ${formatDate(input.asOf)}`,
    sections: [
      {
        title: "Unpaid invoices",
        empty: "Nothing is unpaid on this lease.",
        columns: [
          { key: "number", label: "Invoice", kind: "text" },
          { key: "dueDate", label: "Due on", kind: "date" },
          { key: "left", label: "Left on the invoice", kind: "money" },
          {
            key: "toPay",
            label: "To pay after TDS",
            kind: "money",
            hint: "What's left less the TDS the tenant may still keep back",
          },
        ],
        rows: input.unpaid.map((u) => ({
          number: u.number,
          dueDate: u.dueDate,
          left: u.outstandingPaise,
          toPay: u.toPayPaise,
        })),
        totals:
          input.unpaid.length > 0
            ? { number: "Dues", toPay: duesPaise }
            : undefined,
      },
      {
        title: "Settlement",
        empty: "",
        columns: [
          { key: "what", label: "", kind: "text" },
          { key: "amount", label: "Amount", kind: "money" },
        ],
        rows: [
          ...(creditPaise > 0
            ? [
                { what: "Dues after TDS", amount: duesPaise },
                {
                  what: "Less: credit from earlier payments, not yet applied",
                  amount: creditUsedPaise,
                },
                { what: "Dues after credit", amount: netDuesPaise },
              ]
            : []),
          { what: "Security deposit held", amount: input.heldPaise },
          { what: "Less: dues", amount: settlement.adjustPaise },
          { what: "Deposit to refund", amount: settlement.refundPaise },
          ...(settlement.stillOwedPaise > 0
            ? [
                {
                  what: "Still owed by the tenant",
                  amount: settlement.stillOwedPaise,
                },
              ]
            : []),
          ...(creditLeftPaise > 0
            ? [
                {
                  what: "Credit left over, also to pay back",
                  amount: creditLeftPaise,
                },
              ]
            : []),
        ],
      },
    ],
    notes: [
      "Dues are what the tenant is asked to pay, after the TDS they may still keep back; their TDS certificates cover the rest. Charges not invoiced yet (this month's draft, or anything billed in arrears after the lease ends) aren't included.",
      ...(creditPaise > 0
        ? [
            'The tenant has payment credit not yet applied to invoices. It is theirs across all their leases, so a tenant with another lease may want it there instead. Use "Apply credit" on the tenant\'s page so it settles the dues before the deposit is refunded.',
          ]
        : []),
      "This statement doesn't record anything. Record the refund in the lease's deposit, and settle the dues on the invoices. Ask your accountant whether GST applies on any part of the deposit used for dues or kept (D-035).",
    ],
  };
  return { report, settlement };
}
