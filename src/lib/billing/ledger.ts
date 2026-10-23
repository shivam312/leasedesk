// A tenant's ledger: every sent invoice, credit note, payment, TDS amount and
// reversal in date order, with a running balance (docs/BILLING_RULES.md
// section 11). Positive means the tenant owes; negative means they are in
// credit. Pure: the caller loads the rows.

import type { Paise } from "./money";
import type { PlainDate } from "./dates";
import { compareDates } from "./dates";

export type LedgerSource =
  | {
      type: "invoice";
      id: string;
      date: PlainDate;
      number: string;
      totalPaise: Paise;
    }
  | {
      type: "credit_note";
      id: string;
      date: PlainDate;
      number: string;
      invoiceNumber: string;
      totalPaise: Paise;
    }
  | {
      type: "payment";
      id: string;
      date: PlainDate;
      amountReceivedPaise: Paise;
      tdsPaise: Paise;
      /** In words, e.g. "NEFT". */
      mode: string;
      reference: string | null;
    }
  /** Undoes one payment, with its amounts negative. */
  | {
      type: "reversal";
      id: string;
      date: PlainDate;
      amountReceivedPaise: Paise;
      tdsPaise: Paise;
      reference: string | null;
    };

export type LedgerKind =
  "invoice" | "credit_note" | "payment" | "tds" | "reversal" | "tds_reversal";

export type LedgerEntry = {
  date: PlainDate;
  kind: LedgerKind;
  /** The invoice, credit note or payment row it comes from. */
  sourceId: string;
  label: string;
  debitPaise: Paise;
  creditPaise: Paise;
  /** After this entry: positive is owed, negative is credit. */
  balancePaise: Paise;
};

export type Ledger = {
  entries: LedgerEntry[];
  closingPaise: Paise;
  totalDebitPaise: Paise;
  totalCreditPaise: Paise;
};

/**
 * Within one day: what was billed, then credit notes, then payments and
 * reversals in the order they were made (so paying, reversing and paying
 * again on one day reads as it happened). TDS shares its payment's place.
 */
const DAY_ORDER: Record<LedgerKind, number> = {
  invoice: 0,
  credit_note: 1,
  payment: 2,
  tds: 2,
  reversal: 2,
  tds_reversal: 2,
};

type Unbalanced = Omit<LedgerEntry, "balancePaise">;

function entriesOf(s: LedgerSource): Unbalanced[] {
  const base = { date: s.date, sourceId: s.id };
  const amounts =
    s.type === "invoice" || s.type === "credit_note"
      ? [s.totalPaise]
      : [s.amountReceivedPaise, s.tdsPaise];
  if (!amounts.every((a) => Number.isSafeInteger(a)))
    throw new RangeError(
      `${"number" in s ? s.number : s.id} has an amount that isn't whole paise`,
    );
  switch (s.type) {
    case "invoice":
      if (s.totalPaise < 0)
        throw new RangeError(`Invoice ${s.number} has a negative total`);
      return [
        {
          ...base,
          kind: "invoice",
          label: `Invoice ${s.number}`,
          debitPaise: s.totalPaise,
          creditPaise: 0,
        },
      ];
    case "credit_note":
      if (s.totalPaise <= 0)
        throw new RangeError(`Credit note ${s.number} must be more than ₹0`);
      return [
        {
          ...base,
          kind: "credit_note",
          label: `Credit note ${s.number} for invoice ${s.invoiceNumber}`,
          debitPaise: 0,
          creditPaise: s.totalPaise,
        },
      ];
    case "payment": {
      if (s.amountReceivedPaise <= 0 || s.tdsPaise < 0)
        throw new RangeError(
          `Payment ${s.id} must have a positive amount and no negative TDS`,
        );
      const ref = s.reference ? `, ref ${s.reference}` : "";
      const out: Unbalanced[] = [
        {
          ...base,
          kind: "payment",
          label: `Payment received (${s.mode}${ref})`,
          debitPaise: 0,
          creditPaise: s.amountReceivedPaise,
        },
      ];
      if (s.tdsPaise > 0)
        out.push({
          ...base,
          kind: "tds",
          label: "TDS kept back by the tenant",
          debitPaise: 0,
          creditPaise: s.tdsPaise,
        });
      return out;
    }
    case "reversal": {
      if (s.amountReceivedPaise >= 0 || s.tdsPaise > 0)
        throw new RangeError(
          `Reversal ${s.id} must have a negative amount and no positive TDS`,
        );
      const out: Unbalanced[] = [
        {
          ...base,
          kind: "reversal",
          label: "Payment reversed",
          debitPaise: -s.amountReceivedPaise,
          creditPaise: 0,
        },
      ];
      if (s.tdsPaise < 0)
        out.push({
          ...base,
          kind: "tds_reversal",
          label: "TDS kept back, reversed",
          debitPaise: -s.tdsPaise,
          creditPaise: 0,
        });
      return out;
    }
  }
}

/**
 * The ledger, oldest first. Same-day entries go invoices, credit notes,
 * then payments (each followed by its TDS) and reversals in the order given,
 * so pass rows in the order they were made.
 */
export function tenantLedger(sources: readonly LedgerSource[]): Ledger {
  const unbalanced = sources
    .flatMap(entriesOf)
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        compareDates(a.e.date, b.e.date) ||
        DAY_ORDER[a.e.kind] - DAY_ORDER[b.e.kind] ||
        a.i - b.i,
    )
    .map(({ e }) => e);
  let balance = 0;
  let debit = 0;
  let credit = 0;
  const entries = unbalanced.map((e) => {
    debit += e.debitPaise;
    credit += e.creditPaise;
    balance += e.debitPaise - e.creditPaise;
    return { ...e, balancePaise: balance };
  });
  return {
    entries,
    closingPaise: balance,
    totalDebitPaise: debit,
    totalCreditPaise: credit,
  };
}
