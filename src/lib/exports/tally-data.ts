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
import { todayInIndia } from "@/lib/today";
import { parseStoredSettings, type Settings } from "@/lib/settings/schema";
import { loadSettings, saveSettings } from "@/lib/settings/store";
import { GST_STATES } from "@/lib/india/identifiers";
import {
  ledgerMasters,
  tallyVouchers,
  type TallyLedgerMaster,
  type TallyLedgers,
  type TallyVoucher,
} from "./tally";

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

export type PartyLedger = {
  name: string;
  /** Saved as the tenant's `tally.partyLedger`; otherwise its company name today. */
  saved: boolean;
  gstin: string | null;
  state: string | null;
  settings: unknown;
};

/** Each tenant's party ledger: its `tally.partyLedger`, or its company name. */
export async function partyLedgers(
  s: Scoped,
): Promise<Map<string, PartyLedger>> {
  const rows = await s.tx
    .select({
      id: tenants.id,
      name: tenants.companyName,
      gstin: tenants.gstin,
      stateCode: tenants.stateCode,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(s.where(tenants));
  return new Map(
    rows.map((t) => {
      const saved = parseStoredSettings("tenant", t.settings)[
        "tally.partyLedger"
      ];
      return [
        t.id,
        {
          name: saved || t.name,
          saved: !!saved,
          gstin: t.gstin,
          state: GST_STATES[t.stateCode] ?? null,
          settings: t.settings,
        },
      ];
    }),
  );
}

/**
 * Save the party ledger name of each tenant in a Tally file that didn't have
 * one yet, as its `tally.partyLedger` (logged). A tenant renamed later keeps
 * posting to the same Tally ledger instead of starting a new one.
 */
export async function saveFirstPartyNames(
  s: Scoped,
  unsaved: readonly { tenantId: string; name: string; settings: unknown }[],
) {
  for (const t of unsaved)
    await saveSettings(
      s,
      { scope: "tenant", id: t.tenantId },
      {
        ...parseStoredSettings("tenant", t.settings),
        "tally.partyLedger": t.name,
      },
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
): Promise<{
  vouchers: TallyVoucher[];
  documentIds: string[];
  masters: TallyLedgerMaster[];
  /** Tenants in the file whose Tally name isn't saved yet. */
  unsavedParties: { tenantId: string; name: string; settings: unknown }[];
}> {
  const ledgers = tallyLedgers(await loadSettings(s));
  const parties = await partyLedgers(s);
  const inFile = new Set<string>();
  const party = (tenantId: string) => {
    const p = parties.get(tenantId);
    if (!p) throw new Error(`Tenant ${tenantId} has no party ledger`);
    inFile.add(tenantId);
    return p.name;
  };
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
  const applications = await laterCreditApplications(s, from, to);
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
            createdAt: paymentAllocations.createdAt,
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
        // Only what it settled when recorded (the same transaction, so the
        // same created_at); credit applied later is its own Journal.
        allocations: allocations
          .filter(
            (a) =>
              a.paymentId === p.id &&
              a.createdAt.getTime() === p.createdAt.getTime(),
          )
          .map((a) => ({ invoiceNumber: a.number ?? "", amount: a.amount })),
      })),
      creditApplications: applications.map((c) => ({
        ...c,
        party: party(c.tenantId),
      })),
    },
    ledgers,
  );
  const byName = new Map(
    [...inFile].map((id) => {
      const p = parties.get(id)!;
      return [p.name, { gstin: p.gstin, state: p.state }];
    }),
  );
  return {
    vouchers,
    documentIds: [
      ...invoiceIds,
      ...noteIds,
      ...paymentIds,
      ...applications.map((c) => c.id),
    ],
    masters: ledgerMasters(vouchers, ledgers, byName),
    unsavedParties: [...inFile]
      .map((tenantId) => ({ tenantId, ...parties.get(tenantId)! }))
      .filter((p) => !p.saved)
      .map(({ tenantId, name, settings }) => ({ tenantId, name, settings })),
  };
}

/**
 * Credit applied to invoices after its payment was recorded ("Apply
 * credit"), on an India date in `from`–`to`: one per payment and moment,
 * identified by its first allocation's id.
 */
async function laterCreditApplications(
  s: Scoped,
  from: PlainDate,
  to: PlainDate,
) {
  const india = sql`(${paymentAllocations.createdAt} at time zone 'Asia/Kolkata')::date`;
  const rows = await s.tx
    .select({
      id: paymentAllocations.id,
      paymentId: paymentAllocations.paymentId,
      tenantId: paymentAllocations.tenantId,
      amount: paymentAllocations.amountSettled,
      createdAt: paymentAllocations.createdAt,
      number: invoices.number,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
    .where(
      s.where(
        paymentAllocations,
        eq(payments.kind, "payment"),
        ne(paymentAllocations.createdAt, payments.createdAt),
        sql`${india} >= ${from}::date and ${india} <= ${to}::date`,
      ),
    )
    .orderBy(paymentAllocations.createdAt, paymentAllocations.id);
  const groups = new Map<
    string,
    {
      id: string;
      tenantId: string;
      date: PlainDate;
      narration: string;
      allocations: { invoiceNumber: string; amount: number }[];
    }
  >();
  for (const r of rows) {
    const k = `${r.paymentId}|${r.createdAt.getTime()}`;
    const g = groups.get(k) ?? {
      id: r.id,
      tenantId: r.tenantId,
      date: todayInIndia(r.createdAt),
      narration: "Credit on account applied to invoices",
      allocations: [],
    };
    groups.set(k, g);
    g.allocations.push({ invoiceNumber: r.number ?? "", amount: r.amount });
  }
  return [...groups.values()];
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
