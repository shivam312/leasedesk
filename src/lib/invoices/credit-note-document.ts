// What a credit-note PDF prints (india-compliance skill: "Credit Note", its
// own number, and the original invoice's number and date) [CA]. Printed from
// the invoice's frozen supplier and tenant copies (D18). Pure.

import { percent } from "@/lib/billing/explain";
import type { creditNoteLines, creditNotes, invoices } from "@/lib/db/schema";
import { formatDate, formatINR } from "@/lib/format";
import { amountInWords } from "@/lib/india/amount-in-words";
import { halfRate, stateLabel, type InvoiceDocument } from "./document";

export const CREDIT_REASONS = {
  correction: "Correction",
  waiver: "Waiver",
  discount: "Discount",
  other: "Other",
} as const;

export type CreditNoteSource = {
  note: Pick<
    typeof creditNotes.$inferSelect,
    | "number"
    | "date"
    | "reason"
    | "note"
    | "supplyType"
    | "taxableAmount"
    | "cgst"
    | "sgst"
    | "igst"
    | "roundOff"
    | "total"
  >;
  invoice: Pick<
    typeof invoices.$inferSelect,
    "number" | "invoiceDate" | "placeOfSupply" | "supplier" | "recipient"
  >;
  lines: {
    line: Pick<
      typeof creditNoteLines.$inferSelect,
      "description" | "taxableAmount" | "gstRateBp" | "cgst" | "sgst" | "igst"
    >;
    sacCode: string;
    periodStart: string;
    periodEnd: string;
  }[];
};

export function creditNoteDocument(src: CreditNoteSource): InvoiceDocument {
  const { note, invoice } = src;
  if (!invoice.supplier || !invoice.recipient || !invoice.number)
    throw new Error("A credit note's invoice is missing its sent copies");
  const supplier = invoice.supplier;
  const recipient = invoice.recipient;
  const interState = note.supplyType === "inter_state";
  const reason = CREDIT_REASONS[note.reason];
  return {
    title: "Credit Note",
    numberLabel: "Credit note no",
    dateLabel: "Credit note date",
    draft: false,
    notice: null,
    copyLabel: "Original for recipient",
    number: note.number,
    invoiceDate: formatDate(note.date),
    dueDate: null,
    against: `${invoice.number} dated ${formatDate(invoice.invoiceDate)}`,
    reason: note.note ? `${reason}: ${note.note}` : reason,
    supplier: {
      name: supplier.legalName,
      address: supplier.address,
      gstin: supplier.gstin ?? "Unregistered",
      pan: supplier.gstin ? supplier.gstin.slice(2, 12) : null,
    },
    recipient: {
      name: recipient.companyName,
      address: recipient.billingAddress,
      gstin: recipient.gstin ?? "Unregistered",
      state: stateLabel(recipient.stateCode),
    },
    placeOfSupply: stateLabel(invoice.placeOfSupply),
    property: recipient.property,
    taxColumns: interState ? ["IGST"] : ["CGST", "SGST"],
    lines: src.lines.map(({ line: l, sacCode, periodStart, periodEnd }, i) => ({
      number: String(i + 1),
      description: l.description,
      detail: null,
      sac: sacCode,
      period: `${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
      taxable: formatINR(l.taxableAmount),
      taxes: interState
        ? [`IGST ${percent(l.gstRateBp)} ${formatINR(l.igst)}`]
        : [
            `CGST ${halfRate(l.gstRateBp)} ${formatINR(l.cgst)}`,
            `SGST ${halfRate(l.gstRateBp)} ${formatINR(l.sgst)}`,
          ],
      total: formatINR(l.taxableAmount + l.cgst + l.sgst + l.igst),
    })),
    totals: [
      { label: "Taxable value", amount: formatINR(note.taxableAmount) },
      ...(interState
        ? [{ label: "IGST", amount: formatINR(note.igst) }]
        : [
            { label: "CGST", amount: formatINR(note.cgst) },
            { label: "SGST", amount: formatINR(note.sgst) },
          ]),
      ...(note.roundOff !== 0
        ? [{ label: "Round off", amount: formatINR(note.roundOff) }]
        : []),
      { label: "Credit note total", amount: formatINR(note.total) },
    ],
    amountInWords: amountInWords(note.total),
    payment: null,
    reverseCharge: "No",
    footnote: "This is a computer-generated credit note.",
  };
}
