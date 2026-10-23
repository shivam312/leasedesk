// Loading what goes into a Tally file for some dates, for the current
// organization, and recording each file handed over. Building the vouchers
// and the XML is pure (tally.ts).

import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import { insertLogged } from "@/lib/db/activity-log";
import {
  creditNoteLines,
  creditNotes,
  exports,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { parseStoredSettings, type Settings } from "@/lib/settings/schema";
import { loadSettings } from "@/lib/settings/store";
import { tallyVouchers, type TallyLedgers, type TallyVoucher } from "./tally";

const MODES: Record<string, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  other: "Payment",
};

const REASONS: Record<string, string> = {
  correction: "Correction",
  waiver: "Waiver",
  discount: "Discount",
  other: "Other",
};

/** The organization's ledger names (settings `tally.*`). */
export function tallyLedgers(settings: Settings): TallyLedgers {
  return {
    rent: settings["tally.ledgerRent"],
    maintenance: settings["tally.ledgerMaintenance"],
    otherIncome: settings["tally.ledgerOtherIncome"],
    cgst: settings["tally.ledgerCgst"],
    sgst: settings["tally.ledgerSgst"],
    igst: settings["tally.ledgerIgst"],
    tds: settings["tally.ledgerTds"],
    roundOff: settings["tally.ledgerRoundOff"],
    bank: settings["tally.ledgerBank"],
  };
}

/** Each tenant's party ledger: its `tally.partyLedger`, or its company name. */
export async function partyLedgers(s: Scoped): Promise<Map<string, string>> {
  const rows = await s.tx
    .select({
      id: tenants.id,
      name: tenants.companyName,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(s.where(tenants));
  return new Map(
    rows.map((t) => [
      t.id,
      parseStoredSettings("tenant", t.settings)["tally.partyLedger"] || t.name,
    ]),
  );
}

/**
 * The vouchers for `from`–`to`: sent invoices by invoice date, credit notes
 * by their date, payments and reversals by the date received or reversed.
 */
export async function tallyExportData(
  s: Scoped,
  from: PlainDate,
  to: PlainDate,
): Promise<{ vouchers: TallyVoucher[]; documentIds: string[] }> {
  const ledgers = tallyLedgers(await loadSettings(s));
  const parties = await partyLedgers(s);
  const party = (tenantId: string) => parties.get(tenantId) ?? "";
  const [invoiceRows, noteRows, paymentRows] = await Promise.all([
    s.tx
      .select()
      .from(invoices)
      .where(
        s.where(
          invoices,
          ne(invoices.status, "draft"),
          gte(invoices.invoiceDate, from),
          lte(invoices.invoiceDate, to),
        ),
      ),
    s.tx
      .select({ note: creditNotes, invoice: invoices })
      .from(creditNotes)
      .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
      .where(
        s.where(
          creditNotes,
          gte(creditNotes.date, from),
          lte(creditNotes.date, to),
        ),
      ),
    s.tx
      .select()
      .from(payments)
      .where(
        s.where(
          payments,
          and(gte(payments.receivedDate, from), lte(payments.receivedDate, to)),
        ),
      ),
  ]);
  const invoiceIds = invoiceRows.map((i) => i.id);
  const noteIds = noteRows.map((n) => n.note.id);
  const paymentIds = paymentRows.map((p) => p.id);
  const [lines, noteLines, allocations] = await Promise.all([
    invoiceIds.length === 0
      ? []
      : s.tx
          .select()
          .from(invoiceLines)
          .where(
            s.where(invoiceLines, inArray(invoiceLines.invoiceId, invoiceIds)),
          ),
    noteIds.length === 0
      ? []
      : s.tx
          .select({
            creditNoteId: creditNoteLines.creditNoteId,
            chargeType: invoiceLines.chargeType,
            taxable: creditNoteLines.taxableAmount,
            cgst: creditNoteLines.cgst,
            sgst: creditNoteLines.sgst,
            igst: creditNoteLines.igst,
          })
          .from(creditNoteLines)
          .innerJoin(
            invoiceLines,
            eq(invoiceLines.id, creditNoteLines.invoiceLineId),
          )
          .where(
            s.where(
              creditNoteLines,
              inArray(creditNoteLines.creditNoteId, noteIds),
            ),
          ),
    paymentIds.length === 0
      ? []
      : s.tx
          .select({
            paymentId: paymentAllocations.paymentId,
            amount: paymentAllocations.amountSettled,
            number: invoices.number,
          })
          .from(paymentAllocations)
          .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
          .where(
            s.where(
              paymentAllocations,
              inArray(paymentAllocations.paymentId, paymentIds),
            ),
          ),
  ]);
  const vouchers = tallyVouchers(
    {
      invoices: invoiceRows.map((i) => ({
        id: i.id,
        number: i.number ?? "",
        date: i.invoiceDate,
        party: party(i.tenantId),
        narration: `Invoice ${i.number} for ${formatDate(i.periodStart)} to ${formatDate(i.periodEnd)}`,
        lines: lines
          .filter((l) => l.invoiceId === i.id)
          .map((l) => ({
            chargeType: l.chargeType,
            taxable: l.taxableAmount,
            cgst: l.cgst,
            sgst: l.sgst,
            igst: l.igst,
          })),
        roundOff: i.roundOff,
        grandTotal: i.grandTotal,
      })),
      creditNotes: noteRows.map(({ note, invoice }) => ({
        id: note.id,
        number: note.number,
        date: note.date,
        party: party(invoice.tenantId),
        invoiceNumber: invoice.number ?? "",
        narration: `Credit note against ${invoice.number}: ${REASONS[note.reason] ?? note.reason}${note.note ? `. ${note.note}` : ""}`,
        lines: noteLines.filter((l) => l.creditNoteId === note.id),
        roundOff: note.roundOff,
        total: note.total,
      })),
      payments: paymentRows.map((p) => ({
        id: p.id,
        kind: p.kind,
        date: p.receivedDate,
        party: party(p.tenantId),
        reference: p.reference,
        narration:
          p.kind === "reversal"
            ? `Reversal of a payment${p.note ? `: ${p.note}` : ""}`
            : `${MODES[p.mode] ?? "Payment"}${p.reference ? ` ${p.reference}` : ""}`,
        amountReceived: p.amountReceived,
        tdsDeducted: p.tdsDeducted,
        allocations: allocations
          .filter((a) => a.paymentId === p.id)
          .map((a) => ({ invoiceNumber: a.number ?? "", amount: a.amount })),
      })),
    },
    ledgers,
  );
  return { vouchers, documentIds: [...invoiceIds, ...noteIds, ...paymentIds] };
}

/** Earlier Tally files that carried any of these documents, newest first. */
export async function earlierTallyExports(s: Scoped, documentIds: string[]) {
  if (documentIds.length === 0) return [];
  const rows = await s.tx
    .select({
      id: exports.id,
      createdAt: exports.createdAt,
      periodStart: exports.periodStart,
      periodEnd: exports.periodEnd,
      documentIds: exports.documentIds,
    })
    .from(exports)
    .where(
      s.where(
        exports,
        eq(exports.kind, "tally_xml"),
        sql`${exports.documentIds} && ${sql.param(documentIds)}::uuid[]`,
      ),
    )
    .orderBy(desc(exports.createdAt));
  const wanted = new Set(documentIds);
  return rows.map((r) => ({
    ...r,
    overlap: r.documentIds.filter((d) => wanted.has(d)).length,
  }));
}

/** Record a Tally file as handed over (logged). */
export async function recordTallyExport(
  s: Scoped,
  from: PlainDate,
  to: PlainDate,
  documentIds: string[],
  voucherCount: number,
) {
  return insertLogged(s, exports, {
    kind: "tally_xml",
    periodStart: from,
    periodEnd: to,
    documentIds,
    voucherCount,
    createdBy: s.userId,
  });
}
