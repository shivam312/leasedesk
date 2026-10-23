// Collections (money received in a period) and outstanding and ageing (what
// is unpaid on a date, by how long it is overdue). Pure: rows in, reports
// out. Amounts are paise as recorded; nothing is recalculated here.

import { compareDates, toDayNumber, type PlainDate } from "@/lib/billing/dates";
import { sumPaise, type Paise } from "@/lib/billing/money";
import { formatDate } from "@/lib/format";
import { asOnLabel, type Report, type ReportRow } from "./report";

export type CollectionPayment = {
  kind: "payment" | "reversal";
  receivedDate: PlainDate;
  tenantName: string;
  mode: string;
  reference: string | null;
  /** Negative on a reversal entry. */
  amountReceived: Paise;
  tdsDeducted: Paise;
  invoiceNumbers: string[];
};

const MODE_LABELS: Record<string, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  cheque: "Cheque",
  cash: "Cash",
  other: "Other",
};

export function collections(
  payments: readonly CollectionPayment[],
  from: PlainDate,
  to: PlainDate,
): Report {
  const inPeriod = payments
    .filter(
      (p) =>
        compareDates(p.receivedDate, from) >= 0 &&
        compareDates(p.receivedDate, to) <= 0,
    )
    .sort(
      (a, b) =>
        compareDates(a.receivedDate, b.receivedDate) ||
        a.tenantName.localeCompare(b.tenantName),
    );
  const rows: ReportRow[] = inPeriod.map((p) => ({
    date: p.receivedDate,
    tenant: p.tenantName,
    mode: MODE_LABELS[p.mode] ?? p.mode,
    reference: p.kind === "reversal" ? "Reversal" : (p.reference ?? ""),
    invoices: p.invoiceNumbers.join(", "),
    received: p.amountReceived,
    tds: p.tdsDeducted,
    settled: sumPaise([p.amountReceived, p.tdsDeducted]),
  }));
  const byTenant = new Map<string, { received: Paise[]; tds: Paise[] }>();
  for (const p of inPeriod) {
    const t = byTenant.get(p.tenantName) ?? { received: [], tds: [] };
    t.received.push(p.amountReceived);
    t.tds.push(p.tdsDeducted);
    byTenant.set(p.tenantName, t);
  }
  const tenantRows: ReportRow[] = [...byTenant]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tenant, t]) => {
      const received = sumPaise(t.received);
      const tds = sumPaise(t.tds);
      return { tenant, received, tds, settled: sumPaise([received, tds]) };
    });
  const received = sumPaise(inPeriod.map((p) => p.amountReceived));
  const tds = sumPaise(inPeriod.map((p) => p.tdsDeducted));
  const totals = { received, tds, settled: sumPaise([received, tds]) };
  return {
    slug: "collections",
    title: "Collections",
    period: `${formatDate(from)} to ${formatDate(to)}`,
    sections: [
      {
        title: "Payments",
        empty: "No payments received in these dates.",
        columns: [
          { key: "date", label: "Received on", kind: "date" },
          { key: "tenant", label: "Tenant", kind: "text" },
          { key: "mode", label: "Mode", kind: "text" },
          { key: "reference", label: "Reference", kind: "text" },
          { key: "invoices", label: "Invoices", kind: "text" },
          { key: "received", label: "Received", kind: "money" },
          { key: "tds", label: "TDS", kind: "money" },
          { key: "settled", label: "Total settled", kind: "money" },
        ],
        rows,
        totals: rows.length > 0 ? { tenant: "Total", ...totals } : undefined,
      },
      {
        title: "By tenant",
        empty: "No payments received in these dates.",
        columns: [
          { key: "tenant", label: "Tenant", kind: "text" },
          { key: "received", label: "Received", kind: "money" },
          { key: "tds", label: "TDS", kind: "money" },
          { key: "settled", label: "Total settled", kind: "money" },
        ],
        rows: tenantRows,
        totals:
          tenantRows.length > 1 ? { tenant: "Total", ...totals } : undefined,
      },
    ],
    notes: [
      "A reversed payment shows on the day it was received and again, as a minus, on the day it was reversed.",
    ],
  };
}

export type AgeingInvoice = {
  tenantName: string;
  number: string;
  invoiceDate: PlainDate;
  dueDate: PlainDate;
  /** What is left to settle, including TDS the tenant is expected to deduct. */
  outstandingPaise: Paise;
  expectedTdsPaise: Paise;
};

export const AGEING_BUCKETS = [
  { key: "notDue", label: "Not due yet", hint: "Due date not passed" },
  { key: "d30", label: "1–30 days", hint: "Overdue up to 1 month" },
  { key: "d60", label: "31–60 days", hint: "Overdue 1–2 months" },
  { key: "d90", label: "61–90 days", hint: "Overdue 2–3 months" },
  { key: "over90", label: "Over 90 days", hint: "Overdue more than 3 months" },
] as const;

export type AgeingBucket = (typeof AGEING_BUCKETS)[number]["key"];

/** Days past the due date on `asOf`: 0 or less is not due yet. */
export function daysOverdue(dueDate: PlainDate, asOf: PlainDate): number {
  return toDayNumber(asOf) - toDayNumber(dueDate);
}

export function ageingBucket(days: number): AgeingBucket {
  if (days <= 0) return "notDue";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "over90";
}

export function ageing(
  invoices: readonly AgeingInvoice[],
  asOf: PlainDate,
): Report {
  const open = invoices
    .filter((i) => i.outstandingPaise !== 0)
    .sort(
      (a, b) =>
        a.tenantName.localeCompare(b.tenantName) ||
        compareDates(a.dueDate, b.dueDate),
    );
  const byTenant = new Map<string, Record<AgeingBucket | "total", Paise[]>>();
  const empty = () => ({
    notDue: [],
    d30: [],
    d60: [],
    d90: [],
    over90: [],
    total: [],
  });
  const all: Record<AgeingBucket | "total", Paise[]> = empty();
  const detail: ReportRow[] = [];
  for (const i of open) {
    const days = daysOverdue(i.dueDate, asOf);
    const bucket = ageingBucket(days);
    const t = byTenant.get(i.tenantName) ?? empty();
    byTenant.set(i.tenantName, t);
    for (const target of [t, all]) {
      target[bucket].push(i.outstandingPaise);
      target.total.push(i.outstandingPaise);
    }
    detail.push({
      tenant: i.tenantName,
      number: i.number,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      days: days > 0 ? days : 0,
      unpaid: i.outstandingPaise,
      tds: i.expectedTdsPaise,
    });
  }
  const sums = (b: Record<AgeingBucket | "total", Paise[]>) => ({
    notDue: sumPaise(b.notDue),
    d30: sumPaise(b.d30),
    d60: sumPaise(b.d60),
    d90: sumPaise(b.d90),
    over90: sumPaise(b.over90),
    total: sumPaise(b.total),
  });
  const tenantRows: ReportRow[] = [...byTenant].map(([tenant, b]) => ({
    tenant,
    ...sums(b),
  }));
  return {
    slug: "ageing",
    title: "Unpaid and ageing",
    period: asOnLabel(asOf),
    sections: [
      {
        title: "By tenant",
        empty: "Nothing is unpaid. Every sent invoice is settled.",
        columns: [
          { key: "tenant", label: "Tenant", kind: "text" },
          ...AGEING_BUCKETS.map((b) => ({
            key: b.key,
            label: b.label,
            kind: "money" as const,
            hint: b.hint,
          })),
          { key: "total", label: "Total unpaid", kind: "money" },
        ],
        rows: tenantRows,
        totals:
          tenantRows.length > 0 ? { tenant: "Total", ...sums(all) } : undefined,
      },
      {
        title: "Unpaid invoices",
        empty: "Nothing is unpaid. Every sent invoice is settled.",
        columns: [
          { key: "tenant", label: "Tenant", kind: "text" },
          { key: "number", label: "Invoice", kind: "text" },
          { key: "invoiceDate", label: "Invoice date", kind: "date" },
          { key: "dueDate", label: "Due on", kind: "date" },
          { key: "days", label: "Days overdue", kind: "count" },
          { key: "unpaid", label: "Unpaid", kind: "money" },
          {
            key: "tds",
            label: "TDS expected",
            kind: "money",
            hint: "Part of the unpaid amount the tenant is expected to keep back as TDS",
          },
        ],
        rows: detail,
      },
    ],
    notes: [
      "Unpaid amounts are as recorded today, including TDS a tenant is expected to deduct. Days overdue count from the due date to the date above.",
    ],
  };
}
