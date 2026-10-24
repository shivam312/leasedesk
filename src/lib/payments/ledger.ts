// Loading a tenant's ledger (src/lib/billing/ledger.ts does the sums): every
// sent invoice (drafts aren't owed yet), credit note, payment and reversal,
// after the tenant's opening balance (D-028) if they have one.

import { and, asc, eq, ne } from "drizzle-orm";
import { tenantLedger, type LedgerSource } from "@/lib/billing/ledger";
import {
  creditNotes,
  invoices,
  openingBalances,
  payments,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { PAYMENT_MODES } from "./forms";

export async function ledgerFor(s: Scoped, tenantId: string) {
  const [sent, notes, paid, opening] = await Promise.all([
    s.tx
      .select()
      .from(invoices)
      .where(
        s.where(
          invoices,
          and(eq(invoices.tenantId, tenantId), ne(invoices.status, "draft")),
        ),
      )
      .orderBy(
        asc(invoices.invoiceDate),
        asc(invoices.sentAt),
        asc(invoices.id),
      ),
    s.tx
      .select({ note: creditNotes, invoiceNumber: invoices.number })
      .from(creditNotes)
      .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
      .where(s.where(creditNotes, eq(invoices.tenantId, tenantId)))
      .orderBy(
        asc(creditNotes.date),
        asc(creditNotes.createdAt),
        asc(creditNotes.number),
      ),
    s.tx
      .select()
      .from(payments)
      .where(s.where(payments, eq(payments.tenantId, tenantId)))
      .orderBy(
        asc(payments.receivedDate),
        asc(payments.createdAt),
        asc(payments.id),
      ),
    s.tx
      .select()
      .from(openingBalances)
      .where(s.where(openingBalances, eq(openingBalances.tenantId, tenantId))),
  ]);
  const sources: LedgerSource[] = [
    ...opening.map((o): LedgerSource => ({
      type: "opening_balance",
      id: o.id,
      date: o.asOnDate,
      amountPaise: o.amount,
    })),
    ...sent.map((i): LedgerSource => ({
      type: "invoice",
      id: i.id,
      date: i.invoiceDate,
      number: i.number ?? "",
      totalPaise: i.grandTotal,
    })),
    ...notes.map(({ note, invoiceNumber }): LedgerSource => ({
      type: "credit_note",
      id: note.id,
      date: note.date,
      number: note.number,
      invoiceNumber: invoiceNumber ?? "",
      totalPaise: note.total,
    })),
    ...paid.map((p): LedgerSource =>
      p.kind === "reversal"
        ? {
            type: "reversal",
            id: p.id,
            date: p.receivedDate,
            amountReceivedPaise: p.amountReceived,
            tdsPaise: p.tdsDeducted,
            reference: p.reference,
          }
        : {
            type: "payment",
            id: p.id,
            date: p.receivedDate,
            amountReceivedPaise: p.amountReceived,
            tdsPaise: p.tdsDeducted,
            mode: PAYMENT_MODES[p.mode],
            reference: p.reference,
          },
    ),
  ];
  // Each invoice's stored status and due date, for its "Overdue" badge
  // (src/lib/invoices/status.ts).
  const invoiceStatus = new Map(
    sent.map((i) => [i.id, { status: i.status, dueDate: i.dueDate }]),
  );
  return { ...tenantLedger(sources), invoiceStatus };
}
