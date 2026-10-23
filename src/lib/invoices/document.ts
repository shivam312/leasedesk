// What an invoice PDF prints, as plain strings (india-compliance skill, "GST
// tax invoice: required content" [CA]). Pure: the PDF component only lays this
// out, so every rule about what appears is tested here.

import { percent } from "@/lib/billing/explain";
import type { invoiceLines, invoices, buildings } from "@/lib/db/schema";
import { formatDate, formatINR } from "@/lib/format";
import { amountInWords } from "@/lib/india/amount-in-words";
import { GST_STATES } from "@/lib/india/identifiers";
import { upiPaymentLink } from "@/lib/india/upi";
import {
  propertyLine,
  recipientCopy,
  supplierCopy,
  type RecipientSource,
  type SupplierSource,
} from "./copies";

export type DocumentSource = {
  invoice: Pick<
    typeof invoices.$inferSelect,
    | "status"
    | "number"
    | "invoiceDate"
    | "dueDate"
    | "placeOfSupply"
    | "supplyType"
    | "taxableTotal"
    | "cgstTotal"
    | "sgstTotal"
    | "igstTotal"
    | "roundOff"
    | "grandTotal"
    | "expectedTds"
    | "supplier"
    | "recipient"
  >;
  /** Current details, printed on drafts only. */
  entity: SupplierSource;
  tenant: RecipientSource;
  building: Pick<typeof buildings.$inferSelect, "name" | "address" | "city">;
  unitCodes: string[];
  lines: Pick<
    typeof invoiceLines.$inferSelect,
    | "position"
    | "description"
    | "sacCode"
    | "periodStart"
    | "periodEnd"
    | "quantityLabel"
    | "taxableAmount"
    | "gstRateBp"
    | "cgst"
    | "sgst"
    | "igst"
  >[];
};

export type InvoiceDocument = {
  title: "Tax Invoice" | "Credit Note";
  /** "Invoice no" or "Credit note no", and the same for the date. */
  numberLabel: string;
  dateLabel: string;
  draft: boolean;
  /** A banner above everything, for anything that isn't a payable invoice. */
  notice: string | null;
  /** "Original for recipient" (Rule 48 [CA], D-013). */
  copyLabel: string;
  number: string;
  invoiceDate: string;
  /** Null on a credit note. */
  dueDate: string | null;
  /** A credit note's original invoice: "B1/26-27/0001 dated 01-11-2026". */
  against: string | null;
  /** A credit note's reason, e.g. "Waiver: rent-free week agreed". */
  reason: string | null;
  supplier: {
    name: string;
    address: string;
    gstin: string;
    pan: string | null;
  };
  recipient: { name: string; address: string; gstin: string; state: string };
  placeOfSupply: string;
  property: string;
  taxColumns: ("CGST" | "SGST" | "IGST")[];
  lines: {
    number: string;
    description: string;
    detail: string | null;
    sac: string;
    period: string;
    taxable: string;
    taxes: string[];
    total: string;
  }[];
  totals: { label: string; amount: string }[];
  amountInWords: string;
  /** How to pay; null on a credit note. */
  payment: {
    rows: [string, string][];
    /** Null when nothing is asked for: cancelled, paid or part-paid. */
    toPay: string | null;
    /** The UPI QR's content; null on drafts, cancelled and paid invoices, and without a UPI ID. */
    upiLink: string | null;
  } | null;
  reverseCharge: "No";
  /** "This is a computer-generated invoice." */
  footnote: string;
};

/** "B1/26-27/0001" → "Invoice-B1-26-27-0001.pdf"; a draft → "Invoice-Not-sent-yet.pdf". */
export function pdfFileName(number: string, creditNote = false): string {
  return `${creditNote ? "Credit-note" : "Invoice"}-${number.replace(/[^A-Za-z0-9-]/g, "-")}.pdf`;
}

/** "27" → "Maharashtra (27)". */
export function stateLabel(code: string): string {
  const name = GST_STATES[code];
  return name ? `${name} (${code})` : code;
}

/**
 * Half a GST rate, as CGST or SGST: 1800 bp → "9%", 1250 → "6.25%",
 * 25 → "0.125%". Integer arithmetic in thousandths of a percent.
 */
export function halfRate(bp: number): string {
  // bp / 2 / 100 % = bp × 5 thousandths of a percent.
  const thousandths = bp * 5;
  const whole = Math.trunc(thousandths / 1000);
  const rest = thousandths % 1000;
  if (rest === 0) return `${whole}%`;
  return `${whole}.${String(rest).padStart(3, "0").replace(/0+$/, "")}%`;
}

/**
 * UPI's usual limit per payment is ₹1,00,000. Above it, the QR leaves the
 * amount out so the tenant can split the payment or use their bank (D24).
 */
export const UPI_AMOUNT_LIMIT_PAISE = 1_00_000_00;

const NOTICES: Partial<Record<DocumentSource["invoice"]["status"], string>> = {
  draft:
    "NOT SENT YET. For checking only: it becomes a tax invoice when you send it, with its invoice number.",
  cancelled: "CANCELLED. This invoice is not payable.",
  paid: "PAID. Nothing more to pay on this invoice.",
};

export function invoiceDocument(src: DocumentSource): InvoiceDocument {
  const { invoice } = src;
  const draft = invoice.status === "draft";
  // A sent invoice prints only from the copies made when it was sent (D18).
  if (!draft && (!invoice.supplier || !invoice.recipient))
    throw new Error("A sent invoice is missing its supplier or tenant copy");
  const supplier = draft ? supplierCopy(src.entity) : invoice.supplier!;
  const recipient = draft
    ? recipientCopy(src.tenant, propertyLine(src.building, src.unitCodes))
    : invoice.recipient!;
  const interState = invoice.supplyType === "inter_state";
  const taxColumns: InvoiceDocument["taxColumns"] = interState
    ? ["IGST"]
    : ["CGST", "SGST"];

  const lines = src.lines.map((l) => {
    // Within a state the rate is split evenly; across states IGST is the whole rate.
    const taxes = interState
      ? [`IGST ${percent(l.gstRateBp)} ${formatINR(l.igst)}`]
      : [
          `CGST ${halfRate(l.gstRateBp)} ${formatINR(l.cgst)}`,
          `SGST ${halfRate(l.gstRateBp)} ${formatINR(l.sgst)}`,
        ];
    return {
      number: String(l.position),
      description: l.description,
      detail: l.quantityLabel,
      sac: l.sacCode,
      period: `${formatDate(l.periodStart)} to ${formatDate(l.periodEnd)}`,
      taxable: formatINR(l.taxableAmount),
      taxes,
      total: formatINR(l.taxableAmount + l.cgst + l.sgst + l.igst),
    };
  });

  const totals = [
    { label: "Taxable value", amount: formatINR(invoice.taxableTotal) },
    ...(interState
      ? [{ label: "IGST", amount: formatINR(invoice.igstTotal) }]
      : [
          { label: "CGST", amount: formatINR(invoice.cgstTotal) },
          { label: "SGST", amount: formatINR(invoice.sgstTotal) },
        ]),
    ...(invoice.roundOff !== 0
      ? [{ label: "Round off", amount: formatINR(invoice.roundOff) }]
      : []),
    { label: "Total", amount: formatINR(invoice.grandTotal) },
  ];

  // What the tenant is asked to pay: the total less the TDS they're expected
  // to deduct (D24). Nothing for a cancelled or paid invoice; a part-paid one
  // has a balance that payments (M5) know, so no amount is printed for it.
  const asksForPayment =
    invoice.status === "draft" ||
    invoice.status === "sent" ||
    invoice.status === "overdue";
  const payable = asksForPayment || invoice.status === "part_paid";
  const toPayPaise = Math.max(invoice.grandTotal - invoice.expectedTds, 0);
  const toPay = !asksForPayment
    ? null
    : invoice.expectedTds > 0 && toPayPaise > 0
      ? `${formatINR(toPayPaise)} (total ${formatINR(invoice.grandTotal)} less TDS ${formatINR(invoice.expectedTds)})`
      : formatINR(toPayPaise);
  const qrAmount =
    asksForPayment && toPayPaise <= UPI_AMOUNT_LIMIT_PAISE ? toPayPaise : 0;
  const rows: [string, string | null][] = [
    ["Bank", supplier.bankName],
    ["Account name", supplier.bankAccountName],
    ["Account number", supplier.bankAccountNumber],
    ["IFSC", supplier.ifsc],
    ["UPI ID", supplier.upiId],
  ];

  return {
    title: "Tax Invoice",
    numberLabel: "Invoice no",
    dateLabel: "Invoice date",
    draft,
    notice: NOTICES[invoice.status] ?? null,
    copyLabel: "Original for recipient",
    number: invoice.number ?? "Not sent yet",
    invoiceDate: formatDate(invoice.invoiceDate),
    dueDate: formatDate(invoice.dueDate),
    against: null,
    reason: null,
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
    taxColumns,
    lines,
    totals,
    amountInWords: amountInWords(invoice.grandTotal),
    payment: {
      rows: rows.filter((r): r is [string, string] => Boolean(r[1])),
      toPay,
      upiLink:
        !draft && payable && supplier.upiId && invoice.number
          ? upiPaymentLink({
              upiId: supplier.upiId,
              payeeName: supplier.legalName,
              amountPaise: qrAmount,
              note: invoice.number,
            })
          : null,
    },
    reverseCharge: "No",
    footnote: "This is a computer-generated invoice.",
  };
}
