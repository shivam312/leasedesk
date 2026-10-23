// Issuing credit notes (docs/BILLING_RULES.md section 12) [CA]. A credit note
// is numbered and saved in one transaction, and is never changed afterwards
// (D4). The amounts come from the pure engine (creditNoteAmounts).

import { asc, eq, sum } from "drizzle-orm";
import {
  creditNoteAmounts,
  creditNoteDeadline,
  type CreditableLine,
} from "@/lib/billing/credit-note";
import { compareDates, type PlainDate } from "@/lib/billing/dates";
import { insertLogged, updateLogged } from "@/lib/db/activity-log";
import {
  buildings,
  creditNoteLines,
  creditNotes,
  invoiceLines,
  invoices,
  paymentAllocations,
  type creditNoteReason,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";
import { lockTenantMoney } from "@/lib/payments/payments";
import { loadSettings } from "@/lib/settings/store";
import { takeNumber } from "./numbering";
import { SendError } from "./send";

export type CreditNoteReason = (typeof creditNoteReason.enumValues)[number];

/** What a sent invoice can still be credited, line by line. */
export async function creditableInvoice(s: Scoped, invoiceId: string) {
  const [invoice] = await s.tx
    .select()
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, invoiceId)));
  if (!invoice) return null;
  const lines = await s.tx
    .select()
    .from(invoiceLines)
    .where(s.where(invoiceLines, eq(invoiceLines.invoiceId, invoiceId)))
    .orderBy(asc(invoiceLines.position));
  const credited = await s.tx
    .select({
      invoiceLineId: creditNoteLines.invoiceLineId,
      taxable: sum(creditNoteLines.taxableAmount).mapWith(Number),
      cgst: sum(creditNoteLines.cgst).mapWith(Number),
      sgst: sum(creditNoteLines.sgst).mapWith(Number),
      igst: sum(creditNoteLines.igst).mapWith(Number),
    })
    .from(creditNoteLines)
    .where(s.where(creditNoteLines, eq(creditNoteLines.invoiceId, invoiceId)))
    .groupBy(creditNoteLines.invoiceLineId);
  const [roundOff] = await s.tx
    .select({ total: sum(creditNotes.roundOff).mapWith(Number) })
    .from(creditNotes)
    .where(s.where(creditNotes, eq(creditNotes.invoiceId, invoiceId)));
  const byLine = new Map(credited.map((c) => [c.invoiceLineId, c]));
  const creditable: CreditableLine[] = lines.map((l) => {
    const c = byLine.get(l.id);
    return {
      id: l.id,
      description: l.description,
      taxablePaise: l.taxableAmount,
      gstRateBp: l.gstRateBp,
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
      credited: {
        taxable: c?.taxable ?? 0,
        cgst: c?.cgst ?? 0,
        sgst: c?.sgst ?? 0,
        igst: c?.igst ?? 0,
      },
    };
  });
  return {
    invoice,
    lines: creditable,
    creditedRoundOff: roundOff?.total ?? 0,
  };
}

/** Why a credit note can't be issued against this invoice today, or null. */
export function creditRefusal(
  invoice: Pick<typeof invoices.$inferSelect, "status" | "invoiceDate">,
  date: PlainDate,
): string | null {
  if (invoice.status === "draft")
    return "This invoice hasn't been sent yet, so there's nothing to credit. Send it first, or make the month's invoices again to change it.";
  if (invoice.status === "cancelled")
    return "This invoice has already been fully credited.";
  if (compareDates(date, invoice.invoiceDate) < 0)
    return `A credit note can't be dated before its invoice (${formatDate(invoice.invoiceDate)}).`;
  const deadline = creditNoteDeadline(invoice.invoiceDate);
  if (compareDates(date, deadline) > 0)
    return `GST on this invoice can only be reduced by a credit note until ${formatDate(deadline)}. Ask your accountant how to settle it now.`;
  return null;
}

export type IssueCreditNote = {
  invoiceId: string;
  date: PlainDate;
  reason: CreditNoteReason;
  note: string | null;
  lines: { lineId: string; taxablePaise: number }[];
};

/**
 * Number and save a credit note. Call inside its own runScoped transaction:
 * the invoice row is locked, so two credit notes against it can't both take
 * the same amount.
 */
export async function issueCreditNote(s: Scoped, input: IssueCreditNote) {
  // The tenant's money lock first (as payments take it), then the invoice.
  const [found] = await s.tx
    .select({ tenantId: invoices.tenantId })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, input.invoiceId)));
  if (!found) throw new SendError("That invoice couldn't be found.");
  await lockTenantMoney(s, found.tenantId);
  const [locked] = await s.tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, input.invoiceId)))
    .for("update");
  if (!locked) throw new SendError("That invoice couldn't be found.");
  const data = await creditableInvoice(s, input.invoiceId);
  if (!data) throw new SendError("That invoice couldn't be found.");
  const { invoice } = data;
  const refusal = creditRefusal(invoice, input.date);
  if (refusal) throw new SendError(refusal);

  let amounts;
  try {
    amounts = creditNoteAmounts({
      supply: invoice.supplyType,
      roundOff: invoice.roundOff,
      creditedRoundOff: data.creditedRoundOff,
      lines: data.lines,
      request: input.lines,
    });
  } catch (error) {
    throw new SendError(
      error instanceof Error ? `${error.message}.` : String(error),
    );
  }

  // Until D-019 is answered, a credit note never takes off money a payment
  // has already settled, so no payment is left stranded on the invoice.
  const [paid] = await s.tx
    .select({ total: sum(paymentAllocations.amountSettled).mapWith(Number) })
    .from(paymentAllocations)
    .where(
      s.where(paymentAllocations, eq(paymentAllocations.invoiceId, invoice.id)),
    );
  const [creditedSoFar] = await s.tx
    .select({ total: sum(creditNotes.total).mapWith(Number) })
    .from(creditNotes)
    .where(s.where(creditNotes, eq(creditNotes.invoiceId, invoice.id)));
  const paidPaise = paid?.total ?? 0;
  if (paidPaise > 0) {
    const unpaid = Math.max(
      0,
      invoice.grandTotal - (creditedSoFar?.total ?? 0) - paidPaise,
    );
    if (amounts.totals.total > unpaid)
      throw new SendError(
        `${formatINR(paidPaise)} of this invoice is already paid, so a credit note can take off at most ${formatINR(unpaid)} (what is still unpaid). To credit more, reverse the payment first, issue the credit note, then record the payment again: anything extra stays as credit for the tenant's next invoice.`,
      );
  }

  const [building] = await s.tx
    .select({ name: buildings.name, prefix: buildings.creditNotePrefix })
    .from(buildings)
    .where(s.where(buildings, eq(buildings.id, invoice.buildingId)));
  if (!building) throw new Error("The invoice's building is missing");
  const settings = await loadSettings(s, {
    billingEntityId: invoice.billingEntityId,
  });
  let taken;
  try {
    taken = await takeNumber(s, {
      billingEntityId: invoice.billingEntityId,
      kind: "credit_note",
      prefix: building.prefix,
      date: input.date,
      format: settings["invoice.numberFormat"],
      startingNumber: {},
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invoice number"))
      throw new SendError(
        `The credit note number would be too long or has a character GST doesn't allow. Change ${building.name}'s credit note prefix, then try again.`,
      );
    throw error;
  }

  const { totals } = amounts;
  const note = await insertLogged(s, creditNotes, {
    invoiceId: invoice.id,
    seriesId: taken.seriesId,
    number: taken.number,
    date: input.date,
    reason: input.reason,
    note: input.note,
    supplyType: invoice.supplyType,
    taxableAmount: totals.taxable,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    roundOff: totals.roundOff,
    total: totals.total,
    createdBy: s.userId,
  });
  for (const line of amounts.lines)
    await insertLogged(s, creditNoteLines, {
      creditNoteId: note.id,
      invoiceId: invoice.id,
      invoiceLineId: line.invoiceLineId,
      description: line.description,
      taxableAmount: line.taxablePaise,
      gstRateBp: line.gstRateBp,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
    });
  // Nothing left to pay on it: the invoice reads "Credit note issued".
  if (amounts.fullyCredited)
    await updateLogged(s, invoices, invoice.id, { status: "cancelled" });
  return note;
}

/** An invoice's credit notes, oldest first. */
export async function creditNotesFor(s: Scoped, invoiceId: string) {
  return s.tx
    .select()
    .from(creditNotes)
    .where(s.where(creditNotes, eq(creditNotes.invoiceId, invoiceId)))
    .orderBy(asc(creditNotes.date), asc(creditNotes.number));
}

/** One credit note with its lines and invoice. */
export async function getCreditNote(s: Scoped, id: string) {
  const [note] = await s.tx
    .select()
    .from(creditNotes)
    .where(s.where(creditNotes, eq(creditNotes.id, id)));
  if (!note) return null;
  const [invoice] = await s.tx
    .select()
    .from(invoices)
    .where(s.where(invoices, eq(invoices.id, note.invoiceId)));
  if (!invoice) return null;
  const lines = await s.tx
    .select({
      line: creditNoteLines,
      sacCode: invoiceLines.sacCode,
      periodStart: invoiceLines.periodStart,
      periodEnd: invoiceLines.periodEnd,
      position: invoiceLines.position,
    })
    .from(creditNoteLines)
    .innerJoin(invoiceLines, eq(invoiceLines.id, creditNoteLines.invoiceLineId))
    .where(s.where(creditNoteLines, eq(creditNoteLines.creditNoteId, id)))
    .orderBy(asc(invoiceLines.position));
  return { note, invoice, lines };
}
