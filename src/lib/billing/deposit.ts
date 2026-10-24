// The security deposit as a ledger: what is held, what may go out, and how
// it settles against a tenant's dues on exit. Pure; integer paise. Applying
// a deposit to dues is flagged for the accountant, as GST may apply on the
// adjusted amount (docs/BILLING_RULES.md, deposits [CA]).

import { formatDate, formatINR } from "@/lib/format";
import { compareDates, type PlainDate } from "./dates";
import { sumPaise, type Paise } from "./money";

export type DepositEntryKind =
  "received" | "refunded" | "adjusted" | "forfeited";

/** Received, less refunded, adjusted and forfeited. */
export function depositHeld(
  entries: readonly { kind: DepositEntryKind; amount: Paise }[],
): Paise {
  const into = sumPaise(
    entries.filter((e) => e.kind === "received").map((e) => e.amount),
  );
  const out = sumPaise(
    entries.filter((e) => e.kind !== "received").map((e) => e.amount),
  );
  return into - out;
}

type DatedEntry = { kind: DepositEntryKind; amount: Paise; date: PlainDate };

/**
 * Why a new entry isn't allowed, or null. Nothing goes out beyond what was
 * held on its date: the entries are replayed in date order with the new one
 * in place (a receipt before an outflow on the same day), and the balance
 * must never go below zero, so a backdated refund can't exceed what was held
 * then, nor leave a later outflow short.
 */
export function depositProblem(
  entries: readonly DatedEntry[],
  kind: DepositEntryKind,
  amount: Paise,
  date: PlainDate,
): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return "Enter an amount above ₹0.";
  if (kind === "received") return null;
  if (depositHeld(entries) <= 0)
    return "No deposit is held for this lease yet.";
  const added = { kind, amount, date };
  const all = [...entries, added]
    .map((e, order) => ({ ...e, order }))
    .sort(
      (a, b) =>
        compareDates(a.date, b.date) ||
        Number(b.kind === "received") - Number(a.kind === "received") ||
        a.order - b.order,
    );
  let balance = 0;
  for (const [i, e] of all.entries()) {
    if (e.kind === "received") {
      balance += e.amount;
      continue;
    }
    if (e.amount <= balance) {
      balance -= e.amount;
      continue;
    }
    if (e.order !== entries.length)
      // An entry already recorded would go short after this one.
      return `That would leave only ${formatINR(balance)} for the ${formatINR(e.amount)} paid out on ${formatDate(e.date)}.`;
    if (balance === 0)
      return `Nothing was held on ${formatDate(date)}. Check the date.`;
    return i === all.length - 1
      ? `Only ${formatINR(balance)} of the deposit is held.`
      : `Only ${formatINR(balance)} of the deposit was held on ${formatDate(date)}.`;
  }
  return null;
}

/**
 * On exit: the deposit goes to unpaid dues first, the rest is refunded, and
 * whatever the deposit doesn't cover is still owed. `duesPaise` is what the
 * tenant is asked to pay: what's left on their invoices less the TDS they
 * may still keep back (amountToAsk), never the gross amount, so TDS isn't
 * taken from the deposit as well.
 */
export function depositSettlement(
  heldPaise: Paise,
  duesPaise: Paise,
): { adjustPaise: Paise; refundPaise: Paise; stillOwedPaise: Paise } {
  const held = Math.max(0, heldPaise);
  const dues = Math.max(0, duesPaise);
  const adjustPaise = Math.min(held, dues);
  return {
    adjustPaise,
    refundPaise: held - adjustPaise,
    stillOwedPaise: dues - adjustPaise,
  };
}
