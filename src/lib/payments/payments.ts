// Recording and reversing payments (docs/BILLING_RULES.md sections 10–11).
// The amounts come from the pure engine (src/lib/billing/allocation.ts);
// this module reads what a tenant owes, saves the payment, its allocations
// and TDS records in one transaction, and moves each invoice's status on.
// Payments are never edited: a wrong one is reversed (reversePayment).

import { and, asc, desc, eq, inArray, notInArray, sql, sum } from "drizzle-orm";
import {
  allocatePayment,
  checkAllocation,
  expectedTdsAfterCredits,
  invoiceSettlement,
  oldestFirst,
  remainingExpectedTds,
  splitTds,
  type Allocation,
  type OpenInvoice,
} from "@/lib/billing/allocation";
import { compareDates, type PlainDate } from "@/lib/billing/dates";
import { tdsQuarter } from "@/lib/billing/tds";
import type { BillingSettings, ChargeType } from "@/lib/billing/types";
import { insertLogged, logActivity, updateLogged } from "@/lib/db/activity-log";
import {
  creditNoteLines,
  creditNotes,
  invoiceLines,
  invoices,
  paymentAllocations,
  paymentMode,
  payments,
  tdsRecords,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";
import { billingSettings } from "@/lib/settings/billing";
import { tenantTds } from "@/lib/invoices/run";
import { loadSettings } from "@/lib/settings/store";

export type PaymentMode = (typeof paymentMode.enumValues)[number];

/** A refusal with a message to show as it is. */
export class PaymentError extends Error {}

/** An unpaid invoice, with what the payment form shows. */
export type UnpaidInvoice = OpenInvoice & {
  invoiceDate: PlainDate;
  periodStart: PlainDate;
  grandTotalPaise: number;
  status: (typeof invoices.$inferSelect)["status"];
};

/** The tenant's settings that payments use (TDS rounding, tolerance, quarter). */
export async function paymentSettings(
  s: Scoped,
  tenantId: string,
): Promise<BillingSettings> {
  return billingSettings(await loadSettings(s, { tenantId }));
}

/**
 * Per invoice: payments applied (with their TDS), credit notes, taxable
 * value credited and TDS recorded by active payments.
 */
async function settledBy(s: Scoped, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return new Map<string, Settled>();
  const [allocated, credited, tds] = await Promise.all([
    s.tx
      .select({
        invoiceId: paymentAllocations.invoiceId,
        total: sum(paymentAllocations.amountSettled).mapWith(Number),
      })
      .from(paymentAllocations)
      .where(
        s.where(
          paymentAllocations,
          inArray(paymentAllocations.invoiceId, invoiceIds),
        ),
      )
      .groupBy(paymentAllocations.invoiceId),
    s.tx
      .select({
        invoiceId: creditNotes.invoiceId,
        total: sum(creditNotes.total).mapWith(Number),
      })
      .from(creditNotes)
      .where(s.where(creditNotes, inArray(creditNotes.invoiceId, invoiceIds)))
      .groupBy(creditNotes.invoiceId),
    s.tx
      .select({
        invoiceId: tdsRecords.invoiceId,
        total: sum(tdsRecords.amount).mapWith(Number),
      })
      .from(tdsRecords)
      .innerJoin(payments, eq(payments.id, tdsRecords.paymentId))
      .where(
        s.where(
          tdsRecords,
          inArray(tdsRecords.invoiceId, invoiceIds),
          eq(payments.status, "active"),
        ),
      )
      .groupBy(tdsRecords.invoiceId),
  ]);
  const map = new Map<string, Settled>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) {
      v = { allocated: 0, credited: 0, tds: 0 };
      map.set(id, v);
    }
    return v;
  };
  for (const a of allocated) get(a.invoiceId).allocated = a.total;
  for (const c of credited) get(c.invoiceId).credited = c.total;
  for (const t of tds) get(t.invoiceId).tds = t.total;
  return map;
}

type Settled = {
  allocated: number;
  credited: number;
  tds: number;
};

/** Each line of these invoices, with the taxable value credit notes took off it. */
async function creditedLines(s: Scoped, invoiceIds: string[]) {
  const map = new Map<
    string,
    {
      chargeType: ChargeType;
      taxablePaise: number;
      creditedTaxablePaise: number;
    }[]
  >();
  if (invoiceIds.length === 0) return map;
  const lines = await s.tx
    .select({
      id: invoiceLines.id,
      invoiceId: invoiceLines.invoiceId,
      chargeType: invoiceLines.chargeType,
      taxable: invoiceLines.taxableAmount,
    })
    .from(invoiceLines)
    .where(s.where(invoiceLines, inArray(invoiceLines.invoiceId, invoiceIds)));
  const credits = await s.tx
    .select({
      lineId: creditNoteLines.invoiceLineId,
      taxable: sum(creditNoteLines.taxableAmount).mapWith(Number),
    })
    .from(creditNoteLines)
    .where(
      s.where(creditNoteLines, inArray(creditNoteLines.invoiceId, invoiceIds)),
    )
    .groupBy(creditNoteLines.invoiceLineId);
  const byLine = new Map(credits.map((c) => [c.lineId, c.taxable]));
  for (const l of lines) {
    const list = map.get(l.invoiceId) ?? [];
    list.push({
      chargeType: l.chargeType,
      taxablePaise: l.taxable,
      creditedTaxablePaise: byLine.get(l.id) ?? 0,
    });
    map.set(l.invoiceId, list);
  }
  return map;
}

/**
 * Serialise every change to one tenant's payments, credit and credit notes
 * until the transaction ends (a transaction-scoped advisory lock), so a
 * reversal, a payment, applying credit and a credit note never interleave.
 */
export async function lockTenantMoney(s: Scoped, tenantId: string) {
  await s.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`tenant-money:${tenantId}`}, 0))`,
  );
}

/**
 * A tenant's sent invoices with something left to pay, oldest first. With
 * `lock`, the rows are locked until the transaction ends, so two payments
 * can't both settle the same amount.
 */
export async function unpaidInvoices(
  s: Scoped,
  tenantId: string,
  settings: Pick<BillingSettings, "tdsRounding">,
  { lock = false }: { lock?: boolean } = {},
): Promise<UnpaidInvoice[]> {
  const query = s.tx
    .select()
    .from(invoices)
    .where(
      s.where(
        invoices,
        eq(invoices.tenantId, tenantId),
        notInArray(invoices.status, ["draft", "cancelled"]),
      ),
    )
    .orderBy(asc(invoices.id));
  const rows = lock ? await query.for("update") : await query;
  const settled = await settledBy(
    s,
    rows.map((r) => r.id),
  );
  const credited = await creditedLines(
    s,
    rows.filter((r) => (settled.get(r.id)?.credited ?? 0) > 0).map((r) => r.id),
  );
  const [tenant] = await s.tx
    .select()
    .from(tenants)
    .where(s.where(tenants, eq(tenants.id, tenantId)));
  if (!tenant) throw new PaymentError("That tenant couldn't be found.");
  const tds = tenantTds(tenant);
  const open = rows.map((r): UnpaidInvoice => {
    const v = settled.get(r.id);
    const { outstandingPaise } = invoiceSettlement({
      grandTotalPaise: r.grandTotal,
      allocatedPaise: v?.allocated ?? 0,
      creditedPaise: v?.credited ?? 0,
    });
    return {
      id: r.id,
      number: r.number ?? "",
      dueDate: r.dueDate,
      invoiceDate: r.invoiceDate,
      periodStart: r.periodStart,
      grandTotalPaise: r.grandTotal,
      status: r.status,
      outstandingPaise,
      expectedTdsPaise: remainingExpectedTds({
        expectedTdsPaise: expectedTdsAfterCredits({
          storedExpectedTdsPaise: r.expectedTds,
          lines: credited.get(r.id) ?? [],
          tds,
          settings,
        }),
        tdsRecordedPaise: v?.tds ?? 0,
        outstandingPaise,
      }),
    };
  });
  return oldestFirst(open);
}

/**
 * Set each invoice's status from what is applied to it: paid, part paid, or
 * back to sent (an overdue invoice stays overdue). A fully credited invoice
 * keeps "Credit note issued".
 */
export async function refreshInvoiceStatus(s: Scoped, invoiceIds: string[]) {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return;
  const rows = await s.tx
    .select()
    .from(invoices)
    .where(s.where(invoices, inArray(invoices.id, ids)));
  const settled = await settledBy(s, ids);
  for (const r of rows) {
    if (r.status === "draft" || r.status === "cancelled") continue;
    const v = settled.get(r.id);
    const { status } = invoiceSettlement({
      grandTotalPaise: r.grandTotal,
      allocatedPaise: v?.allocated ?? 0,
      creditedPaise: v?.credited ?? 0,
    });
    const next =
      status === "unpaid"
        ? r.status === "overdue"
          ? "overdue"
          : "sent"
        : status;
    if (next !== r.status)
      await updateLogged(s, invoices, r.id, { status: next });
  }
}

export type RecordPayment = {
  tenantId: string;
  receivedDate: PlainDate;
  amountReceivedPaise: number;
  tdsPaise: number;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  /** The amounts to apply, or "auto" for oldest first. */
  allocations: Allocation[] | "auto";
  bankStatementLineId?: string | null;
};

/**
 * Save a payment: its allocations (checked against what is unpaid now,
 * under a row lock), a TDS record per invoice its TDS is against, and each
 * invoice's new status. Call inside its own runScoped transaction.
 */
export async function recordPayment(
  s: Scoped,
  input: RecordPayment,
  today: PlainDate,
) {
  if (compareDates(input.receivedDate, today) > 0)
    throw new PaymentError(
      `The date received can't be after today (${formatDate(today)}).`,
    );
  const [tenant] = await s.tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(s.where(tenants, eq(tenants.id, input.tenantId)));
  if (!tenant) throw new PaymentError("That tenant couldn't be found.");
  await lockTenantMoney(s, input.tenantId);
  const settings = await paymentSettings(s, input.tenantId);
  const open = await unpaidInvoices(s, input.tenantId, settings, {
    lock: true,
  });
  const allocations = (
    input.allocations === "auto"
      ? allocatePayment({
          receivedPaise: input.amountReceivedPaise,
          tdsPaise: input.tdsPaise,
          invoices: open,
        }).allocations
      : input.allocations
  ).filter((a) => a.amountPaise !== 0);
  const refusal = checkAllocation({
    receivedPaise: input.amountReceivedPaise,
    tdsPaise: input.tdsPaise,
    allocations,
    invoices: open,
  });
  if (refusal) throw new PaymentError(refusal);

  const payment = await insertLogged(s, payments, {
    tenantId: input.tenantId,
    kind: "payment",
    receivedDate: input.receivedDate,
    amountReceived: input.amountReceivedPaise,
    tdsDeducted: input.tdsPaise,
    mode: input.mode,
    reference: input.reference,
    note: input.note,
    bankStatementLineId: input.bankStatementLineId ?? null,
    createdBy: s.userId,
  });
  for (const a of allocations)
    await insertLogged(s, paymentAllocations, {
      tenantId: input.tenantId,
      paymentId: payment.id,
      invoiceId: a.invoiceId,
      amountSettled: a.amountPaise,
    });
  const byId = new Map(open.map((i) => [i.id, i]));
  for (const t of splitTds({
    tdsPaise: input.tdsPaise,
    allocations,
    invoices: open,
  })) {
    const invoice = byId.get(t.invoiceId)!;
    const { financialYear, quarter } = tdsQuarter({
      paymentDate: input.receivedDate,
      invoiceDate: invoice.invoiceDate,
      settings,
    });
    await insertLogged(s, tdsRecords, {
      tenantId: input.tenantId,
      paymentId: payment.id,
      invoiceId: t.invoiceId,
      amount: t.tdsPaise,
      financialYear,
      quarter,
    });
  }
  await refreshInvoiceStatus(
    s,
    allocations.map((a) => a.invoiceId),
  );
  return { payment, allocations };
}

/**
 * Reverse a payment: a reversal entry dated `date` with the negative amounts,
 * taking off every invoice exactly what the payment settled, and the payment
 * marked reversed. Its TDS records stop counting (they belong to a reversed
 * payment). Record the correct payment again afterwards.
 */
export async function reversePayment(
  s: Scoped,
  paymentId: string,
  date: PlainDate,
  reason: string,
) {
  // Take the tenant's lock before reading anything else, so credit applied
  // from this payment in another transaction is either all seen or waits.
  const [found] = await s.tx
    .select({ tenantId: payments.tenantId })
    .from(payments)
    .where(s.where(payments, eq(payments.id, paymentId)));
  if (!found) throw new PaymentError("That payment couldn't be found.");
  await lockTenantMoney(s, found.tenantId);
  const [original] = await s.tx
    .select()
    .from(payments)
    .where(s.where(payments, eq(payments.id, paymentId)))
    .for("update");
  if (!original) throw new PaymentError("That payment couldn't be found.");
  if (original.kind !== "payment")
    throw new PaymentError("A reversal entry can't itself be reversed.");
  if (original.status === "reversed")
    throw new PaymentError("This payment has already been reversed.");
  if (compareDates(date, original.receivedDate) < 0)
    throw new PaymentError(
      `A reversal can't be dated before the payment (${formatDate(original.receivedDate)}).`,
    );
  // Lock the invoices it touched, as recordPayment does.
  const applied = await s.tx
    .select({
      invoiceId: paymentAllocations.invoiceId,
      total: sum(paymentAllocations.amountSettled).mapWith(Number),
    })
    .from(paymentAllocations)
    .where(
      s.where(paymentAllocations, eq(paymentAllocations.paymentId, paymentId)),
    )
    .groupBy(paymentAllocations.invoiceId);
  if (applied.length > 0)
    await s.tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        s.where(
          invoices,
          inArray(
            invoices.id,
            applied.map((a) => a.invoiceId),
          ),
        ),
      )
      .orderBy(asc(invoices.id))
      .for("update");

  const reversal = await insertLogged(s, payments, {
    tenantId: original.tenantId,
    kind: "reversal",
    receivedDate: date,
    amountReceived: -original.amountReceived,
    tdsDeducted: -original.tdsDeducted,
    mode: original.mode,
    reference: original.reference,
    note: reason,
    reversesPaymentId: original.id,
    createdBy: s.userId,
  });
  for (const a of applied)
    if (a.total !== 0)
      await insertLogged(s, paymentAllocations, {
        tenantId: original.tenantId,
        paymentId: reversal.id,
        invoiceId: a.invoiceId,
        amountSettled: -a.total,
      });
  await updateLogged(s, payments, original.id, {
    status: "reversed",
    reversedByPaymentId: reversal.id,
  });
  await logActivity(s, {
    entityType: "payments",
    entityId: original.id,
    action: "reverse",
    after: { reversalId: reversal.id, date, reason },
  });
  await refreshInvoiceStatus(
    s,
    applied.map((a) => a.invoiceId),
  );
  return reversal;
}

/** A tenant's active payments with part not yet applied to invoices. */
export async function paymentsWithCredit(s: Scoped, tenantId: string) {
  const rows = await s.tx
    .select({
      id: payments.id,
      receivedDate: payments.receivedDate,
      amountReceived: payments.amountReceived,
      tdsDeducted: payments.tdsDeducted,
      applied:
        sql<number>`coalesce(sum(${paymentAllocations.amountSettled}), 0)`.mapWith(
          Number,
        ),
    })
    .from(payments)
    .leftJoin(paymentAllocations, eq(paymentAllocations.paymentId, payments.id))
    .where(
      s.where(
        payments,
        eq(payments.tenantId, tenantId),
        eq(payments.kind, "payment"),
        eq(payments.status, "active"),
      ),
    )
    .groupBy(payments.id)
    .orderBy(asc(payments.receivedDate), asc(payments.createdAt));
  return rows
    .map((r) => ({
      ...r,
      creditPaise: r.amountReceived + r.tdsDeducted - r.applied,
    }))
    .filter((r) => r.creditPaise > 0);
}

/**
 * Apply a tenant's unapplied payment credit to their unpaid invoices, oldest
 * payment first and oldest invoice first (section 11: an overpayment is
 * applied to the next invoice). Returns the total applied.
 */
export async function applyCredit(s: Scoped, tenantId: string) {
  await lockTenantMoney(s, tenantId);
  const settings = await paymentSettings(s, tenantId);
  const open = await unpaidInvoices(s, tenantId, settings, { lock: true });
  const credits = await paymentsWithCredit(s, tenantId);
  const left = new Map(open.map((i) => [i.id, i.outstandingPaise]));
  let total = 0;
  const touched: string[] = [];
  for (const credit of credits) {
    let available = credit.creditPaise;
    for (const invoice of open) {
      if (available <= 0) break;
      const owed = left.get(invoice.id) ?? 0;
      if (owed <= 0) continue;
      const amount = Math.min(owed, available);
      await insertLogged(s, paymentAllocations, {
        tenantId,
        paymentId: credit.id,
        invoiceId: invoice.id,
        amountSettled: amount,
      });
      left.set(invoice.id, owed - amount);
      available -= amount;
      total += amount;
      touched.push(invoice.id);
    }
  }
  await refreshInvoiceStatus(s, touched);
  return total;
}

/** A tenant's payments and reversal entries, newest first. */
export async function paymentsFor(s: Scoped, tenantId: string) {
  return s.tx
    .select()
    .from(payments)
    .where(s.where(payments, eq(payments.tenantId, tenantId)))
    .orderBy(desc(payments.receivedDate), desc(payments.createdAt));
}

/** Recent payments across tenants, newest first, for Billing → Payments. */
export async function recentPayments(s: Scoped, limit = 100) {
  return s.tx
    .select({
      payment: payments,
      tenantName: tenants.companyName,
    })
    .from(payments)
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .where(s.where(payments))
    .orderBy(desc(payments.receivedDate), desc(payments.createdAt))
    .limit(limit);
}

/** One payment with its tenant, the invoices it settles and its TDS records. */
export async function getPayment(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({ payment: payments, tenantName: tenants.companyName })
    .from(payments)
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .where(s.where(payments, eq(payments.id, id)));
  if (!row) return null;
  const allocations = await s.tx
    .select({
      invoiceId: paymentAllocations.invoiceId,
      amount: sum(paymentAllocations.amountSettled).mapWith(Number),
      number: invoices.number,
      invoiceDate: invoices.invoiceDate,
      grandTotal: invoices.grandTotal,
    })
    .from(paymentAllocations)
    .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
    .where(s.where(paymentAllocations, eq(paymentAllocations.paymentId, id)))
    .groupBy(
      paymentAllocations.invoiceId,
      invoices.number,
      invoices.invoiceDate,
      invoices.grandTotal,
    )
    .orderBy(asc(invoices.invoiceDate), asc(invoices.number));
  const tds = await s.tx
    .select()
    .from(tdsRecords)
    .where(s.where(tdsRecords, eq(tdsRecords.paymentId, id)));
  const related =
    row.payment.reversesPaymentId ?? row.payment.reversedByPaymentId;
  const [other] = related
    ? await s.tx
        .select()
        .from(payments)
        .where(s.where(payments, and(eq(payments.id, related))))
    : [];
  return { ...row, allocations, tds, related: other ?? null };
}

/** "₹1,08,000 received + ₹10,000 TDS = ₹1,18,000" for a payment. */
export function paymentSummary(p: {
  amountReceived: number;
  tdsDeducted: number;
}) {
  const received = Math.abs(p.amountReceived);
  const tds = Math.abs(p.tdsDeducted);
  return tds > 0
    ? `${formatINR(received)} received + ${formatINR(tds)} TDS = ${formatINR(received + tds)}`
    : `${formatINR(received)} received`;
}
