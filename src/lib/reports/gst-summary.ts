// The GST summary for a month, for the accountant's GST returns: totals by
// billing GSTIN and GST rate (invoices less credit notes), then every invoice
// and credit note by rate, as GSTR-1 lists them. Invoices count in the month
// of their invoice date and credit notes in the month they were issued;
// figures are copied from the sent documents, never worked out again. [CA]
// (D-026). Pure: documents in, a report out.

import type { PlainDate } from "@/lib/billing/dates";
import { sumPaise, type Paise } from "@/lib/billing/money";
import { stateLabel } from "@/lib/invoices/document";
import { formatMonth } from "@/lib/format";
import type { Report, ReportRow } from "./report";

export type GstLine = {
  gstRateBp: number;
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
};

export type GstDocument = {
  kind: "invoice" | "credit_note";
  /** The billing (supplier) GSTIN. */
  supplierGstin: string;
  number: string;
  date: PlainDate;
  recipientName: string;
  /** Null for a tenant who isn't GST-registered (B2C). */
  recipientGstin: string | null;
  placeOfSupply: string;
  /** Grand total (invoice) or total (credit note), round off included. */
  value: Paise;
  /** For a credit note: the invoice it is against. */
  invoiceNumber?: string;
  invoiceDate?: PlainDate;
  lines: GstLine[];
};

/** A document's lines added up by GST rate, lowest rate first. */
export function byRate(lines: readonly GstLine[]): GstLine[] {
  const rates = new Map<number, GstLine[]>();
  for (const l of lines)
    rates.set(l.gstRateBp, [...(rates.get(l.gstRateBp) ?? []), l]);
  return [...rates]
    .sort(([a], [b]) => a - b)
    .map(([gstRateBp, ls]) => ({
      gstRateBp,
      taxable: sumPaise(ls.map((l) => l.taxable)),
      cgst: sumPaise(ls.map((l) => l.cgst)),
      sgst: sumPaise(ls.map((l) => l.sgst)),
      igst: sumPaise(ls.map((l) => l.igst)),
    }));
}

const negate = (n: Paise) => (n === 0 ? 0 : -n);

export function gstSummary(
  documents: readonly GstDocument[],
  month: string,
): Report {
  const docs = [...documents].sort(
    (a, b) =>
      a.supplierGstin.localeCompare(b.supplierGstin) ||
      a.date.localeCompare(b.date) ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
  const invoiceRows: ReportRow[] = [];
  const creditRows: ReportRow[] = [];
  const summary = new Map<
    string,
    {
      gstin: string;
      type: string;
      rate: number;
      invoiced: Paise[];
      credited: Paise[];
      cgst: Paise[];
      sgst: Paise[];
      igst: Paise[];
    }
  >();
  for (const d of docs) {
    for (const r of byRate(d.lines)) {
      const type = d.recipientGstin ? "B2B" : "B2C";
      const key = `${d.supplierGstin}|${type}|${r.gstRateBp}`;
      const s = summary.get(key) ?? {
        gstin: d.supplierGstin,
        type,
        rate: r.gstRateBp,
        invoiced: [],
        credited: [],
        cgst: [],
        sgst: [],
        igst: [],
      };
      summary.set(key, s);
      const sign = d.kind === "invoice" ? (n: Paise) => n : negate;
      (d.kind === "invoice" ? s.invoiced : s.credited).push(r.taxable);
      s.cgst.push(sign(r.cgst));
      s.sgst.push(sign(r.sgst));
      s.igst.push(sign(r.igst));
      const common = {
        supplierGstin: d.supplierGstin,
        type,
        recipientGstin: d.recipientGstin ?? "",
        recipient: d.recipientName,
        number: d.number,
        date: d.date,
        value: d.value,
        placeOfSupply: stateLabel(d.placeOfSupply),
        rate: r.gstRateBp,
        taxable: r.taxable,
        cgst: r.cgst,
        sgst: r.sgst,
        igst: r.igst,
      };
      if (d.kind === "invoice") invoiceRows.push(common);
      else
        creditRows.push({
          ...common,
          invoiceNumber: d.invoiceNumber ?? "",
          invoiceDate: d.invoiceDate ?? null,
        });
    }
  }
  const summaryRows: ReportRow[] = [...summary.values()]
    .sort(
      (a, b) =>
        a.gstin.localeCompare(b.gstin) ||
        a.type.localeCompare(b.type) ||
        a.rate - b.rate,
    )
    .map((s) => {
      const invoiced = sumPaise(s.invoiced);
      const credited = sumPaise(s.credited);
      const cgst = sumPaise(s.cgst);
      const sgst = sumPaise(s.sgst);
      const igst = sumPaise(s.igst);
      return {
        gstin: s.gstin,
        type: s.type,
        rate: s.rate,
        invoiced,
        credited,
        taxable: sumPaise([invoiced, negate(credited)]),
        cgst,
        sgst,
        igst,
        tax: sumPaise([cgst, sgst, igst]),
      };
    });
  const total = (rows: ReportRow[], key: string) =>
    sumPaise(rows.map((r) => Number(r[key] ?? 0)));
  const docColumns = [
    { key: "supplierGstin", label: "Our GSTIN", kind: "text" as const },
    { key: "type", label: "Type", kind: "text" as const },
    { key: "recipientGstin", label: "Tenant GSTIN", kind: "text" as const },
    { key: "recipient", label: "Tenant", kind: "text" as const },
  ];
  const amountColumns = [
    { key: "rate", label: "GST rate", kind: "percent" as const },
    { key: "taxable", label: "Taxable value", kind: "money" as const },
    { key: "cgst", label: "CGST", kind: "money" as const },
    { key: "sgst", label: "SGST", kind: "money" as const },
    { key: "igst", label: "IGST", kind: "money" as const },
  ];
  const docTotals = (rows: ReportRow[]) =>
    rows.length > 0
      ? {
          recipient: "Total",
          taxable: total(rows, "taxable"),
          cgst: total(rows, "cgst"),
          sgst: total(rows, "sgst"),
          igst: total(rows, "igst"),
        }
      : undefined;
  return {
    slug: "gst-summary",
    title: "GST summary",
    period: formatMonth(month),
    sections: [
      {
        title: "Summary by type and GST rate",
        empty:
          "No invoices or credit notes this month. Invoices count in the month of their invoice date.",
        columns: [
          { key: "gstin", label: "Our GSTIN", kind: "text" },
          {
            key: "type",
            label: "Type",
            kind: "text",
            hint: "B2B: tenant has a GSTIN. B2C: tenant isn't GST-registered",
          },
          { key: "rate", label: "GST rate", kind: "percent" },
          { key: "invoiced", label: "Invoiced (taxable)", kind: "money" },
          {
            key: "credited",
            label: "Credit notes (taxable)",
            kind: "money",
          },
          {
            key: "taxable",
            label: "Net taxable value",
            kind: "money",
            hint: "Invoiced less credit notes, before GST",
          },
          { key: "cgst", label: "Net CGST", kind: "money" },
          { key: "sgst", label: "Net SGST", kind: "money" },
          { key: "igst", label: "Net IGST", kind: "money" },
          { key: "tax", label: "Net GST", kind: "money" },
        ],
        rows: summaryRows,
        totals:
          summaryRows.length > 1
            ? {
                gstin: "Total",
                invoiced: total(summaryRows, "invoiced"),
                credited: total(summaryRows, "credited"),
                taxable: total(summaryRows, "taxable"),
                cgst: total(summaryRows, "cgst"),
                sgst: total(summaryRows, "sgst"),
                igst: total(summaryRows, "igst"),
                tax: total(summaryRows, "tax"),
              }
            : undefined,
      },
      {
        title: "Invoices",
        empty: "No invoices dated this month.",
        columns: [
          ...docColumns,
          { key: "number", label: "Invoice", kind: "text" },
          { key: "date", label: "Invoice date", kind: "date" },
          {
            key: "value",
            label: "Invoice value",
            kind: "money",
            hint: "The invoice's grand total, with GST and round off",
          },
          { key: "placeOfSupply", label: "Place of supply", kind: "text" },
          ...amountColumns,
        ],
        rows: invoiceRows,
        totals: docTotals(invoiceRows),
      },
      {
        title: "Credit notes",
        empty: "No credit notes issued this month.",
        columns: [
          ...docColumns,
          { key: "number", label: "Credit note", kind: "text" },
          { key: "date", label: "Credit note date", kind: "date" },
          { key: "invoiceNumber", label: "Against invoice", kind: "text" },
          { key: "invoiceDate", label: "Invoice date", kind: "date" },
          { key: "value", label: "Credit note value", kind: "money" },
          { key: "placeOfSupply", label: "Place of supply", kind: "text" },
          ...amountColumns,
        ],
        rows: creditRows,
        totals: docTotals(creditRows),
      },
    ],
    notes: [
      "Figures are copied from sent invoices and credit notes. Invoices count in the month of their invoice date, credit notes in the month they were issued. Invoices not sent yet are left out.",
      "An invoice with lines at two GST rates shows one row per rate; its invoice value is the whole invoice.",
      "Check with your chartered accountant before filing.",
    ],
  };
}
