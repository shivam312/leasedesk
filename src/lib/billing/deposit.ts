// The security deposit as a ledger: what is held, what may go out, and how
// it settles against a tenant's dues on exit. Pure; integer paise. Applying
// a deposit to dues is flagged for the accountant, as GST may apply on the
// adjusted amount (docs/BILLING_RULES.md, deposits [CA]).

import { formatINR } from "@/lib/format";
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

/** Why a new entry isn't allowed, or null. Nothing goes out beyond what's held. */
export function depositProblem(
  entries: readonly { kind: DepositEntryKind; amount: Paise }[],
  kind: DepositEntryKind,
  amount: Paise,
): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return "Enter an amount above ₹0.";
  if (kind === "received") return null;
  const held = depositHeld(entries);
  if (held <= 0) return "No deposit is held for this lease yet.";
  if (amount > held) return `Only ${formatINR(held)} of the deposit is held.`;
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
