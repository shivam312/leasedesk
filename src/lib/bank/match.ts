// Matching imported bank credits to tenants' invoices: suggestions are
// worked out by the pure matcher (matching.ts) and stored on each line;
// the user confirms them in bulk, which records each as a payment through
// recordPayment (same checks and locks as typing it in), or marks lines as
// not rent. Nothing is recorded without the user confirming.

import { and, asc, count, eq, inArray, notInArray } from "drizzle-orm";
import type { Allocation } from "@/lib/billing/allocation";
import { compareDates } from "@/lib/billing/dates";
import { updateLogged } from "@/lib/db/activity-log";
import {
  bankAccounts,
  bankStatementLines,
  invoices,
  openingBalances,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import {
  lockTenantMoney,
  PaymentError,
  paymentSettings,
  recordPayment,
  OPENING_BALANCE_LABEL,
  unpaidInvoices,
} from "@/lib/payments/payments";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { guessMode, matchLine, type MatchTenant } from "./matching";

const OPEN_LINE = ["unmatched", "suggested"] as const;

/**
 * Every tenant with a sent invoice or an opening balance (D-028), and what
 * they still owe.
 */
async function matchTenants(s: Scoped): Promise<MatchTenant[]> {
  const [withInvoices, withOpening] = await Promise.all([
    s.tx
      .selectDistinct({ id: tenants.id, name: tenants.companyName })
      .from(tenants)
      .innerJoin(invoices, eq(invoices.tenantId, tenants.id))
      .where(
        s.where(tenants, notInArray(invoices.status, ["draft", "cancelled"])),
      ),
    s.tx
      .select({ id: tenants.id, name: tenants.companyName })
      .from(tenants)
      .innerJoin(openingBalances, eq(openingBalances.tenantId, tenants.id))
      .where(s.where(tenants)),
  ]);
  const owing = [
    ...new Map(
      [...withInvoices, ...withOpening].map((t) => [t.id, t]),
    ).values(),
  ];
  const result: MatchTenant[] = [];
  for (const t of owing) {
    const settings = await paymentSettings(s, t.id);
    const open = await unpaidInvoices(s, t.id, settings);
    if (open.length > 0) result.push({ ...t, invoices: open });
  }
  return result;
}

/**
 * Work out the suggestion for every line still to match and store it
 * (tenant, invoices, confidence), logging only lines whose suggestion
 * changed. Run after an import and after payments are recorded.
 */
export async function refreshSuggestions(s: Scoped) {
  const lines = await s.tx
    .select()
    .from(bankStatementLines)
    .where(
      s.where(
        bankStatementLines,
        inArray(bankStatementLines.matchStatus, [...OPEN_LINE]),
      ),
    );
  if (lines.length === 0) return 0;
  const owing = await matchTenants(s);
  const settings = billingSettings(await loadSettings(s));
  let suggested = 0;
  for (const l of lines) {
    const m = matchLine({
      line: {
        description: l.description,
        reference: l.reference,
        creditPaise: l.creditAmount,
      },
      tenants: owing,
      settings,
    });
    const next = m
      ? {
          matchStatus: "suggested" as const,
          suggestedTenantId: m.tenantId,
          suggestedInvoiceIds: m.invoiceIds,
          suggestedTdsAmount: m.tdsPaise,
          confidence: m.confidence,
        }
      : {
          matchStatus: "unmatched" as const,
          suggestedTenantId: null,
          suggestedInvoiceIds: null,
          suggestedTdsAmount: null,
          confidence: null,
        };
    if (m) suggested++;
    const same =
      l.matchStatus === next.matchStatus &&
      l.suggestedTenantId === next.suggestedTenantId &&
      l.confidence === next.confidence &&
      l.suggestedTdsAmount === next.suggestedTdsAmount &&
      JSON.stringify(l.suggestedInvoiceIds ?? null) ===
        JSON.stringify(next.suggestedInvoiceIds);
    if (!same) await updateOpenLine(s, l.id, next);
  }
  return suggested;
}

/**
 * Update a line only if it is still to match, under a row lock: a line
 * confirmed or set aside meanwhile in another transaction is left alone.
 */
async function updateOpenLine(
  s: Scoped,
  id: string,
  patch: Partial<typeof bankStatementLines.$inferInsert>,
) {
  const [open] = await s.tx
    .select({ id: bankStatementLines.id })
    .from(bankStatementLines)
    .where(
      s.where(
        bankStatementLines,
        eq(bankStatementLines.id, id),
        inArray(bankStatementLines.matchStatus, [...OPEN_LINE]),
      ),
    )
    .for("update");
  if (!open) return false;
  await updateLogged(s, bankStatementLines, id, patch);
  return true;
}

/** How many bank lines are still to match. */
export async function countLinesToMatch(s: Scoped) {
  const [row] = await s.tx
    .select({ n: count() })
    .from(bankStatementLines)
    .where(
      s.where(
        bankStatementLines,
        inArray(bankStatementLines.matchStatus, [...OPEN_LINE]),
      ),
    );
  return row?.n ?? 0;
}

/** Lines still to match, oldest first, with their account and suggestion. */
export async function linesToMatch(s: Scoped) {
  const lines = await s.tx
    .select({
      line: bankStatementLines,
      bankName: bankAccounts.bankName,
      accountLast4: bankAccounts.accountLast4,
    })
    .from(bankStatementLines)
    .innerJoin(
      bankAccounts,
      eq(bankAccounts.id, bankStatementLines.bankAccountId),
    )
    .where(
      s.where(
        bankStatementLines,
        inArray(bankStatementLines.matchStatus, [...OPEN_LINE]),
      ),
    )
    .orderBy(asc(bankStatementLines.date), asc(bankStatementLines.rowNumber));
  const ids = [
    ...new Set(lines.flatMap((l) => l.line.suggestedInvoiceIds ?? [])),
  ];
  const numbers = ids.length
    ? await s.tx
        .select({ id: invoices.id, number: invoices.number })
        .from(invoices)
        .where(s.where(invoices, inArray(invoices.id, ids)))
    : [];
  const byId = new Map(numbers.map((n) => [n.id, n.number ?? ""]));
  return lines.map((l) => ({
    ...l,
    invoiceNumbers: (l.line.suggestedInvoiceIds ?? []).map(
      // Anything that isn't an invoice is the tenant's opening balance.
      (id) => byId.get(id) ?? OPENING_BALANCE_LABEL,
    ),
  }));
}

/**
 * Record one bank credit as a payment from `tenantId`: TDS and invoices
 * from the matcher for that tenant (the invoices it names first, then the
 * oldest), dated the bank's date. Call in its own transaction.
 */
export async function confirmLine(
  s: Scoped,
  lineId: string,
  tenantId: string,
  today: string,
) {
  // The tenant's money lock first, as recordPayment takes it, so what is
  // worked out below can't go stale before it's saved.
  await lockTenantMoney(s, tenantId);
  const [line] = await s.tx
    .select()
    .from(bankStatementLines)
    .where(s.where(bankStatementLines, eq(bankStatementLines.id, lineId)))
    .for("update");
  if (!line) throw new PaymentError("That bank line couldn't be found.");
  if (line.matchStatus === "matched")
    throw new PaymentError("This bank line is already recorded as a payment.");
  if (line.matchStatus === "ignored")
    throw new PaymentError("This bank line was marked as not rent.");
  const [tenant] = await s.tx
    .select({ id: tenants.id, name: tenants.companyName })
    .from(tenants)
    .where(s.where(tenants, eq(tenants.id, tenantId)));
  if (!tenant) throw new PaymentError("That tenant couldn't be found.");
  const settings = await paymentSettings(s, tenantId);
  const open = await unpaidInvoices(s, tenantId, settings);
  const m = matchLine({
    line: {
      description: line.description,
      reference: line.reference,
      creditPaise: line.creditAmount,
    },
    tenants: [{ ...tenant, invoices: open }],
    settings,
  });
  const tdsPaise = m?.tdsPaise ?? 0;
  // The user confirmed the invoices and TDS shown with the suggestion; if
  // either has changed since (another payment, a credit note), they must
  // look again.
  const sameInvoices =
    JSON.stringify(m?.invoiceIds ?? []) ===
    JSON.stringify(line.suggestedInvoiceIds ?? []);
  if (
    tenantId === line.suggestedTenantId &&
    line.suggestedTdsAmount !== null &&
    (tdsPaise !== line.suggestedTdsAmount || !sameInvoices)
  )
    throw new PaymentError(
      `What ${tenant.name} owes has changed since this was suggested. Check the line again before recording it.`,
    );
  const first = new Set(m?.invoiceIds ?? []);
  const ordered = [
    ...open.filter((i) => first.has(i.id)),
    ...open.filter((i) => !first.has(i.id)),
  ];
  let left = line.creditAmount + tdsPaise;
  const allocations: Allocation[] = [];
  for (const i of ordered) {
    if (left <= 0) break;
    const amount = Math.min(left, i.outstandingPaise);
    allocations.push({ invoiceId: i.id, amountPaise: amount });
    left -= amount;
  }
  if (compareDates(line.date, today) > 0)
    throw new PaymentError("This bank line is dated after today.");
  const { payment } = await recordPayment(
    s,
    {
      tenantId,
      receivedDate: line.date,
      amountReceivedPaise: line.creditAmount,
      tdsPaise,
      mode: guessMode(line.description),
      reference: line.reference?.slice(0, 60) ?? null,
      note: line.description.slice(0, 200),
      allocations,
      bankStatementLineId: line.id,
    },
    today,
  );
  await updateLogged(s, bankStatementLines, line.id, {
    matchStatus: "matched",
    suggestedTenantId: tenantId,
    suggestedInvoiceIds: allocations.map((a) => a.invoiceId),
  });
  return payment;
}

/** Mark lines as not rent (bank interest, refunds, transfers). */
export async function ignoreLines(s: Scoped, lineIds: string[]) {
  const lines = await s.tx
    .select({ id: bankStatementLines.id })
    .from(bankStatementLines)
    .where(
      s.where(
        bankStatementLines,
        and(
          inArray(bankStatementLines.id, lineIds),
          inArray(bankStatementLines.matchStatus, [...OPEN_LINE]),
        ),
      ),
    );
  let n = 0;
  for (const l of lines)
    if (await updateOpenLine(s, l.id, { matchStatus: "ignored" })) n++;
  return n;
}
