// Which tenant and invoices a bank credit most likely pays (india-compliance
// skill, "Bank statement import"). Evidence and its weight:
//   invoice number in the description or reference   50
//   amount = the invoices' total less expected TDS    50 (high)
//   tenant's name in the description                  40 (medium)
//   amount = the invoices' total                      35 (medium)
// A suggestion needs at least 40, and isn't made when two tenants score the
// same. Nothing is ever recorded from a suggestion until the user confirms.
// Pure: the caller passes the tenants' unpaid invoices.

import { allocatePayment, oldestFirst } from "@/lib/billing/allocation";
import type { OpenInvoice } from "@/lib/billing/allocation";
import type { Paise } from "@/lib/billing/money";
import type { BillingSettings } from "@/lib/billing/types";
import { formatINR } from "@/lib/format";
import type { PaymentMode } from "@/lib/payments/payments";

export type MatchTenant = {
  id: string;
  name: string;
  invoices: OpenInvoice[];
};

export type Match = {
  tenantId: string;
  /** The invoices it pays, in the order to apply it. */
  invoiceIds: string[];
  tdsPaise: Paise;
  /** 0–100. */
  confidence: number;
  reasons: string[];
};

const COMPANY_WORDS = new Set([
  "m",
  "s",
  "ms",
  "the",
  "pvt",
  "private",
  "ltd",
  "limited",
  "llp",
  "inc",
  "co",
  "company",
  "corp",
  "corporation",
]);

/** A tenant's name as compared with bank text: no company words, letters and digits only. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !COMPANY_WORDS.has(w))
    .join("");
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Is the tenant's name in the bank text, as whole words? Its first word
 * must be a whole word there, followed by the start of its second (banks
 * cut names short: "ACME SOFTWA"); or the name with its spaces removed is
 * one word ("ACMESOFTWARE"). "Nova" doesn't match "INNOVATIVE".
 */
export function nameIn(text: string, name: string): boolean {
  const key = nameKey(name);
  if (key.length < 4) return false;
  const core = words(name.replace(/&/g, " and ")).filter(
    (w) => !COMPANY_WORDS.has(w),
  );
  const have = words(text);
  for (const [i, w] of have.entries()) {
    if (w === key || (w.length >= 8 && key.startsWith(w))) return true;
    if (w !== core[0]) continue;
    if (core.length === 1) return true;
    const next = have[i + 1] ?? "";
    const second = core[1]!;
    if (
      next === second ||
      (next.length >= 3 && second.startsWith(next)) ||
      (next.startsWith(second) && second.length >= 3)
    )
      return true;
  }
  return false;
}

/**
 * Is the invoice number in the bank text, not just inside a longer number?
 * As printed ("T/26-27/0001", also right after "INV"), or with its
 * punctuation dropped as one word ("T26270001").
 */
export function numberIn(text: string, number: string): boolean {
  const n = squash(number);
  if (n.length < 5) return false;
  if (words(text).includes(n)) return true;
  const escaped = number.toLowerCase().replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9]|inv)${escaped}(?![a-z0-9])`).test(
    text.toLowerCase(),
  );
}

const amountsText = (invoices: OpenInvoice[]) =>
  invoices.length === 1
    ? `invoice ${invoices[0]!.number}`
    : `invoices ${invoices.map((i) => i.number).join(", ")}`;

/** Does the amount pay these invoices less their TDS, or in full? */
function amountFit(
  creditPaise: Paise,
  invoices: OpenInvoice[],
  tolerancePaise: number,
): { score: number; tdsPaise: Paise; reason: string } | null {
  if (invoices.length === 0) return null;
  const owed = invoices.reduce((s, i) => s + i.outstandingPaise, 0);
  const tds = invoices.reduce((s, i) => s + i.expectedTdsPaise, 0);
  if (creditPaise === owed)
    return {
      score: 35,
      tdsPaise: 0,
      reason: `${formatINR(creditPaise)} is ${amountsText(invoices)} in full`,
    };
  const deducted = owed - creditPaise;
  if (
    tds > 0 &&
    deducted > 0 &&
    Math.abs(deducted - tds) <= tolerancePaise * invoices.length
  )
    return {
      score: 50,
      tdsPaise: deducted,
      reason: `${formatINR(creditPaise)} is ${amountsText(invoices)} less ${formatINR(deducted)} TDS`,
    };
  return null;
}

function scoreTenant(
  line: { description: string; reference: string | null; creditPaise: Paise },
  tenant: MatchTenant,
  tolerancePaise: number,
): Match | null {
  const open = oldestFirst(tenant.invoices);
  const reasons: string[] = [];
  let score = 0;

  if (nameIn(line.description, tenant.name)) {
    score += 40;
    reasons.push(`${tenant.name}'s name is in the description`);
  }

  const inReference = (i: OpenInvoice) =>
    numberIn(line.reference ?? "", i.number);
  const numbered = open.filter(
    (i) => inReference(i) || numberIn(line.description, i.number),
  );
  let fit: ReturnType<typeof amountFit> = null;
  let invoices: OpenInvoice[] = [];
  if (numbered.length > 0) {
    score += 50;
    for (const i of numbered)
      reasons.push(
        `Invoice ${i.number} is in the ${inReference(i) ? "reference" : "description"}`,
      );
    invoices = numbered;
    fit = amountFit(line.creditPaise, numbered, tolerancePaise);
    // The named invoices with the oldest ones before them: a payment of
    // Oct and Nov that names only Nov still has its TDS worked out on both.
    for (let k = 0; !fit && k < open.length; k++) {
      const set = open.filter(
        (i, j) => j <= k || numbered.some((n) => n.id === i.id),
      );
      if (set.length === numbered.length) continue;
      fit = amountFit(line.creditPaise, set, tolerancePaise);
      if (fit) invoices = set;
    }
  } else {
    // The oldest k invoices, as a typed payment's TDS is suggested
    // (BILLING_RULES section 10); a newer invoice only when it's named.
    const candidates = open.map((_, k) => open.slice(0, k + 1));
    for (const set of candidates) {
      fit = amountFit(line.creditPaise, set, tolerancePaise);
      if (fit) {
        invoices = set;
        break;
      }
    }
  }
  if (fit) {
    score += fit.score;
    reasons.push(fit.reason);
  } else if (score > 0 && numbered.length === 0) {
    // Named, but the amount fits nothing: a part payment, oldest first.
    invoices = open.filter((i) =>
      allocatePayment({
        receivedPaise: line.creditPaise,
        tdsPaise: 0,
        invoices: open,
      }).allocations.some((a) => a.invoiceId === i.id),
    );
  }
  if (score === 0) return null;
  return {
    tenantId: tenant.id,
    invoiceIds: invoices.map((i) => i.id),
    tdsPaise: fit?.tdsPaise ?? 0,
    confidence: Math.min(100, score),
    reasons,
  };
}

/** The most likely tenant and invoices for a bank credit, or null. */
export function matchLine({
  line,
  tenants,
  settings,
}: {
  line: { description: string; reference: string | null; creditPaise: Paise };
  tenants: readonly MatchTenant[];
  settings: Pick<BillingSettings, "tdsTolerancePaise">;
}): Match | null {
  const scored = tenants
    .map((t) => scoreTenant(line, t, settings.tdsTolerancePaise))
    .filter((m): m is Match => m !== null && m.confidence >= 40)
    .sort((a, b) => b.confidence - a.confidence);
  const [best, next] = scored;
  if (!best) return null;
  if (next && next.confidence === best.confidence) return null;
  return best;
}

/** How the money came, from the bank's words. */
export function guessMode(description: string): PaymentMode {
  const t = description.toUpperCase();
  if (/\bNEFT\b/.test(t)) return "neft";
  if (/\bRTGS\b/.test(t)) return "rtgs";
  if (/\bIMPS\b/.test(t)) return "imps";
  if (/\bUPI\b/.test(t)) return "upi";
  if (/\b(CHQ|CHEQUE|CLG|CLEARING)\b/.test(t)) return "cheque";
  if (/\bCASH\b/.test(t)) return "cash";
  return "other";
}
