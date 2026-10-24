// The Tally export (india-compliance skill, "Tally export"): sent invoices as
// Sales vouchers, credit notes as Credit Note vouchers, payments as Receipt
// vouchers (TDS on its own ledger line) and payment reversals as Journal
// vouchers, in TallyPrime's XML import format. Every voucher balances to the
// paisa. Ledger names are the accountant's (settings `tally.*`). Pure:
// documents in, vouchers and XML out.
//
// The XML follows TallyPrime's documented "Import Data" envelope; it must be
// checked against a real export from a pilot accountant's TallyPrime
// (tests/fixtures/tally/, a human task) before relying on it. [CA]

import type { PlainDate } from "@/lib/billing/dates";
import { sumPaise, type Paise } from "@/lib/billing/money";
import type { ChargeType } from "@/lib/billing/types";
import type { Report, ReportRow } from "@/lib/reports/report";

export type TallyLedgers = {
  rent: string;
  maintenance: string;
  otherIncome: string;
  cgst: string;
  sgst: string;
  igst: string;
  tds: string;
  roundOff: string;
  bank: string;
};

export type TallyLine = {
  chargeType: ChargeType;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
};

export type TallyInvoice = {
  id: string;
  number: string;
  date: PlainDate;
  party: string;
  narration: string;
  lines: TallyLine[];
  roundOff: Paise;
  grandTotal: Paise;
};

export type TallyCreditNote = {
  id: string;
  number: string;
  date: PlainDate;
  party: string;
  invoiceNumber: string;
  narration: string;
  lines: TallyLine[];
  roundOff: Paise;
  total: Paise;
};

export type TallyPayment = {
  id: string;
  kind: "payment" | "reversal";
  date: PlainDate;
  party: string;
  reference: string | null;
  narration: string;
  /** Negative on a reversal. */
  amountReceived: Paise;
  tdsDeducted: Paise;
  /** What it settled on each invoice; negative on a reversal. */
  allocations: { invoiceNumber: string; amount: Paise }[];
};

export type BillRef = {
  name: string;
  type: "New Ref" | "Agst Ref" | "On Account";
  /** Same sign as its entry. */
  amount: Paise;
};

/** Positive is a debit, negative a credit. */
export type TallyEntry = {
  ledger: string;
  amount: Paise;
  bills?: BillRef[];
  /** The tenant's own ledger (Tally's ISPARTYLEDGER). */
  isParty?: boolean;
};

export type TallyVoucher = {
  /** Our document id, so Tally can tell a voucher it already has. */
  id: string;
  type: "Sales" | "Credit Note" | "Receipt" | "Journal";
  date: PlainDate;
  /** Blank lets Tally number it (receipts and journals). */
  number: string;
  party: string;
  reference: string;
  narration: string;
  entries: TallyEntry[];
};

export class UnbalancedVoucherError extends Error {}

const neg = (n: Paise) => (n === 0 ? 0 : -n);

/** Income and tax entries of some lines, as credits. */
function incomeEntries(lines: readonly TallyLine[], l: TallyLedgers) {
  const ledgerOf = (t: ChargeType) =>
    t === "rent" ? l.rent : t === "cam" ? l.maintenance : l.otherIncome;
  const byLedger = new Map<string, Paise[]>();
  const add = (ledger: string, amount: Paise) => {
    if (amount !== 0)
      byLedger.set(ledger, [...(byLedger.get(ledger) ?? []), amount]);
  };
  for (const line of lines) add(ledgerOf(line.chargeType), line.taxable);
  for (const line of lines) {
    add(l.cgst, line.cgst);
    add(l.sgst, line.sgst);
    add(l.igst, line.igst);
  }
  return [...byLedger].map(([ledger, amounts]) => ({
    ledger,
    amount: neg(sumPaise(amounts)),
  }));
}

function checkBalanced(v: TallyVoucher): TallyVoucher {
  const total = sumPaise(v.entries.map((e) => e.amount));
  if (total !== 0)
    throw new UnbalancedVoucherError(
      `${v.type} ${v.number || v.id} is off by ${total} paise`,
    );
  return v;
}

/** Party Dr grand total; income and GST Cr; round off either side. */
export function salesVoucher(inv: TallyInvoice, l: TallyLedgers): TallyVoucher {
  return checkBalanced({
    id: inv.id,
    type: "Sales",
    date: inv.date,
    number: inv.number,
    party: inv.party,
    reference: inv.number,
    narration: inv.narration,
    entries: [
      {
        ledger: inv.party,
        isParty: true,
        amount: inv.grandTotal,
        bills: [{ name: inv.number, type: "New Ref", amount: inv.grandTotal }],
      },
      ...incomeEntries(inv.lines, l),
      ...(inv.roundOff !== 0
        ? [{ ledger: l.roundOff, amount: neg(inv.roundOff) }]
        : []),
    ],
  });
}

/** The mirror of a sale: party Cr against the invoice; income and GST Dr. */
export function creditNoteVoucher(
  cn: TallyCreditNote,
  l: TallyLedgers,
): TallyVoucher {
  return checkBalanced({
    id: cn.id,
    type: "Credit Note",
    date: cn.date,
    number: cn.number,
    party: cn.party,
    reference: cn.invoiceNumber,
    narration: cn.narration,
    entries: [
      {
        ledger: cn.party,
        isParty: true,
        amount: neg(cn.total),
        bills: [
          { name: cn.invoiceNumber, type: "Agst Ref", amount: neg(cn.total) },
        ],
      },
      ...incomeEntries(cn.lines, l).map((e) => ({
        ...e,
        amount: neg(e.amount),
      })),
      ...(cn.roundOff !== 0
        ? [{ ledger: l.roundOff, amount: cn.roundOff }]
        : []),
    ],
  });
}

/**
 * A payment: bank Dr received, TDS Dr, party Cr the total against each
 * invoice it settled, the rest on account. A reversal is the same entries
 * the other way round, as a Journal.
 */
export function receiptVoucher(p: TallyPayment, l: TallyLedgers): TallyVoucher {
  const settled = sumPaise([p.amountReceived, p.tdsDeducted]);
  const allocated = sumPaise(p.allocations.map((a) => a.amount));
  const onAccount = sumPaise([settled, neg(allocated)]);
  const bills: BillRef[] = [
    ...p.allocations
      .filter((a) => a.amount !== 0)
      .map((a) => ({
        name: a.invoiceNumber,
        type: "Agst Ref" as const,
        amount: neg(a.amount),
      })),
    ...(onAccount !== 0
      ? [{ name: "", type: "On Account" as const, amount: neg(onAccount) }]
      : []),
  ];
  return checkBalanced({
    id: p.id,
    type: p.kind === "payment" ? "Receipt" : "Journal",
    date: p.date,
    number: "",
    party: p.party,
    reference: p.reference ?? "",
    narration: p.narration,
    entries: [
      { ledger: l.bank, amount: p.amountReceived },
      ...(p.tdsDeducted !== 0
        ? [{ ledger: l.tds, amount: p.tdsDeducted }]
        : []),
      { ledger: p.party, isParty: true, amount: neg(settled), bills },
    ],
  });
}

/**
 * Credit a tenant had on account, applied to invoices later ("Apply
 * credit"): a Journal moving it from On Account to each invoice. The party
 * ledger is debited and credited the same amount, so only the bills change.
 */
export type TallyCreditApplication = {
  id: string;
  /** The India date it was applied. */
  date: PlainDate;
  party: string;
  narration: string;
  allocations: { invoiceNumber: string; amount: Paise }[];
};

export function creditApplicationVoucher(
  c: TallyCreditApplication,
): TallyVoucher {
  const total = sumPaise(c.allocations.map((a) => a.amount));
  return checkBalanced({
    id: c.id,
    type: "Journal",
    date: c.date,
    number: "",
    party: c.party,
    reference: "",
    narration: c.narration,
    entries: [
      {
        ledger: c.party,
        isParty: true,
        amount: total,
        bills: [{ name: "", type: "On Account", amount: total }],
      },
      {
        ledger: c.party,
        isParty: true,
        amount: neg(total),
        bills: c.allocations.map((a) => ({
          name: a.invoiceNumber,
          type: "Agst Ref" as const,
          amount: neg(a.amount),
        })),
      },
    ],
  });
}

/** Every voucher, in date order: sales, then credit notes, then receipts on a day. */
export function tallyVouchers(
  docs: {
    invoices: readonly TallyInvoice[];
    creditNotes: readonly TallyCreditNote[];
    payments: readonly TallyPayment[];
    creditApplications?: readonly TallyCreditApplication[];
  },
  ledgers: TallyLedgers,
): TallyVoucher[] {
  const order = { Sales: 0, "Credit Note": 1, Receipt: 2, Journal: 3 };
  return [
    ...docs.invoices.map((i) => salesVoucher(i, ledgers)),
    ...docs.creditNotes.map((c) => creditNoteVoucher(c, ledgers)),
    ...docs.payments.map((p) => receiptVoucher(p, ledgers)),
    ...(docs.creditApplications ?? []).map(creditApplicationVoucher),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      order[a.type] - order[b.type] ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
}

// ---- XML ----

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Characters XML 1.0 can't carry at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Paise as Tally's amount text: 11800000 → "118000.00", -5 → "-0.05". */
export function tallyAmount(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Tally's sign convention: a debit is ISDEEMEDPOSITIVE Yes with a negative
 * AMOUNT; a credit is No with a positive AMOUNT.
 */
function entryXml(e: TallyEntry): string {
  const debit = e.amount > 0;
  const amount = tallyAmount(neg(e.amount));
  const bills = (e.bills ?? [])
    .map(
      (b) =>
        `<BILLALLOCATIONS.LIST>${b.name ? `<NAME>${escapeXml(b.name)}</NAME>` : ""}<BILLTYPE>${b.type}</BILLTYPE><AMOUNT>${tallyAmount(neg(b.amount))}</AMOUNT></BILLALLOCATIONS.LIST>`,
    )
    .join("");
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${escapeXml(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><ISPARTYLEDGER>${e.isParty ? "Yes" : "No"}</ISPARTYLEDGER><AMOUNT>${amount}</AMOUNT>${bills}</ALLLEDGERENTRIES.LIST>`;
}

function voucherXml(v: TallyVoucher): string {
  const tag = (name: string, value: string) =>
    value ? `<${name}>${escapeXml(value)}</${name}>` : "";
  return [
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="leasedesk-${v.id}" VCHTYPE="${v.type}" ACTION="Create">`,
    `<DATE>${v.date.replace(/-/g, "")}</DATE>`,
    `<VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME>`,
    tag("VOUCHERNUMBER", v.number),
    tag("PARTYLEDGERNAME", v.party),
    tag("REFERENCE", v.reference),
    tag("NARRATION", v.narration),
    `<EFFECTIVEDATE>${v.date.replace(/-/g, "")}</EFFECTIVEDATE>`,
    ...v.entries.map(entryXml),
    `</VOUCHER></TALLYMESSAGE>`,
  ].join("");
}

/** A ledger the vouchers post to, created in Tally ahead of them. */
export type TallyLedgerMaster = {
  name: string;
  /** Tally's group, e.g. "Sundry Debtors". */
  parent: string;
  /** Bill-by-bill tracking, for tenants' ledgers. */
  billWise: boolean;
  gstin?: string | null;
  /** The state's name as Tally spells it, e.g. "Maharashtra". */
  state?: string | null;
};

/** The groups LeaseDesk creates ledgers under. [CA] */
export const TALLY_GROUPS = {
  party: "Sundry Debtors",
  bank: "Bank Accounts",
  tds: "Current Assets",
} as const;

/**
 * The ledgers to create before the vouchers, so TallyPrime accepts the file
 * without the accountant making each one first: every tenant's party ledger
 * (bill-wise, with GSTIN and state), and the TDS receivable and bank ledgers,
 * each once and only if a voucher uses it. Income, GST and round-off ledgers
 * need GST and tax settings in Tally, so the accountant keeps those.
 */
export function ledgerMasters(
  vouchers: readonly TallyVoucher[],
  ledgers: Pick<TallyLedgers, "tds" | "bank">,
  parties: ReadonlyMap<string, { gstin: string | null; state: string | null }>,
): TallyLedgerMaster[] {
  const used = new Set(vouchers.flatMap((v) => v.entries.map((e) => e.ledger)));
  const partyNames = [
    ...new Set(
      vouchers.flatMap((v) =>
        v.entries.filter((e) => e.isParty).map((e) => e.ledger),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const masters: TallyLedgerMaster[] = partyNames.map((name) => ({
    name,
    parent: TALLY_GROUPS.party,
    billWise: true,
    gstin: parties.get(name)?.gstin ?? null,
    state: parties.get(name)?.state ?? null,
  }));
  if (used.has(ledgers.tds))
    masters.push({
      name: ledgers.tds,
      parent: TALLY_GROUPS.tds,
      billWise: false,
    });
  if (used.has(ledgers.bank))
    masters.push({
      name: ledgers.bank,
      parent: TALLY_GROUPS.bank,
      billWise: false,
    });
  return masters;
}

function ledgerXml(m: TallyLedgerMaster): string {
  const name = escapeXml(m.name);
  return [
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${name}" ACTION="Create">`,
    `<NAME.LIST><NAME>${name}</NAME></NAME.LIST>`,
    `<PARENT>${escapeXml(m.parent)}</PARENT>`,
    `<ISBILLWISEON>${m.billWise ? "Yes" : "No"}</ISBILLWISEON>`,
    m.gstin ? `<PARTYGSTIN>${escapeXml(m.gstin)}</PARTYGSTIN>` : "",
    m.state ? `<LEDSTATENAME>${escapeXml(m.state)}</LEDSTATENAME>` : "",
    `</LEDGER></TALLYMESSAGE>`,
  ].join("");
}

/**
 * The whole file, ready to import in TallyPrime (Import → Transactions): the
 * ledger masters first, then the vouchers that post to them.
 */
export function tallyXml(
  vouchers: readonly TallyVoucher[],
  masters: readonly TallyLedgerMaster[] = [],
): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>`,
    `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>`,
    ...masters.map(ledgerXml),
    ...vouchers.map(voucherXml),
    `</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`,
    ``,
  ].join("\n");
}

/** The same vouchers as rows of entries, for accountants who don't use Tally. */
export function tallyEntriesReport(
  vouchers: readonly TallyVoucher[],
  period: string,
): Report {
  const rows: ReportRow[] = vouchers.flatMap((v) =>
    v.entries.map((e) => ({
      date: v.date,
      type: v.type,
      number: v.number,
      party: v.party,
      reference: v.reference,
      ledger: e.ledger,
      debit: e.amount > 0 ? e.amount : null,
      credit: e.amount < 0 ? neg(e.amount) : null,
      bills: (e.bills ?? [])
        .map((b) => (b.name ? `${b.type} ${b.name}` : b.type))
        .join(", "),
    })),
  );
  const debit = sumPaise(rows.map((r) => Number(r.debit ?? 0)));
  const credit = sumPaise(rows.map((r) => Number(r.credit ?? 0)));
  return {
    slug: "tally-entries",
    title: "Accounting entries",
    period,
    sections: [
      {
        title: "Entries",
        empty: "No sent invoices, credit notes or payments in these dates.",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "type", label: "Voucher type", kind: "text" },
          { key: "number", label: "Voucher no.", kind: "text" },
          { key: "party", label: "Party", kind: "text" },
          { key: "reference", label: "Reference", kind: "text" },
          { key: "ledger", label: "Ledger", kind: "text" },
          { key: "debit", label: "Debit", kind: "money" },
          { key: "credit", label: "Credit", kind: "money" },
          { key: "bills", label: "Bill-wise", kind: "text" },
        ],
        rows,
        totals:
          rows.length > 0 ? { ledger: "Total", debit, credit } : undefined,
      },
    ],
    notes: [
      "Each voucher balances: its debits equal its credits. Ledger names come from Settings → Tally.",
    ],
  };
}
