import { describe, expect, it } from "vitest";
import type { InvoiceDocument } from "../document";
import { renderInvoicePdf } from "../pdf";

const doc: InvoiceDocument = {
  title: "Tax Invoice",
  draft: false,
  notice: null,
  copyLabel: "Original for recipient",
  number: "B1/26-27/0001",
  invoiceDate: "01-11-2026",
  dueDate: "08-11-2026",
  supplier: {
    name: "Demo Properties LLP",
    address: "1 MG Road, Pune",
    gstin: "27AAPFU0939F1ZV",
    pan: "AAPFU0939F",
  },
  recipient: {
    name: "A Very Long Tenant Name Private Limited (Formerly Known As Something Else Entirely)",
    address: "Unit 401, Tower A, Pune",
    gstin: "Unregistered",
    state: "Maharashtra (27)",
  },
  placeOfSupply: "Maharashtra (27)",
  property: "Tower A, MG Road, Pune · Unit 401",
  taxColumns: ["CGST", "SGST"],
  lines: Array.from({ length: 12 }, (_, i) => ({
    number: String(i + 1),
    description: "Rent for Nov 2026",
    detail: "1,250.50 sq ft × ₹85.50",
    sac: "997212",
    period: "01-11-2026 to 30-11-2026",
    taxable: "₹1,00,000",
    taxes: ["CGST 9% ₹9,000", "SGST 9% ₹9,000"],
    total: "₹1,18,000",
  })),
  totals: [
    { label: "Taxable value", amount: "₹12,00,000" },
    { label: "CGST", amount: "₹1,08,000" },
    { label: "SGST", amount: "₹1,08,000" },
    { label: "Total", amount: "₹14,16,000" },
  ],
  amountInWords: "Rupees Fourteen Lakh Sixteen Thousand Only",
  payment: {
    rows: [["UPI ID", "demo@okhdfcbank"]],
    toPay: "₹14,16,000",
    upiLink:
      "upi://pay?pa=demo%40okhdfcbank&pn=Demo&am=1416000.00&cu=INR&tn=B1",
  },
  reverseCharge: "No",
};

describe("renderInvoicePdf", () => {
  it("renders a PDF with a QR code, over more than one page when there are many lines", async () => {
    const pdf = await renderInvoicePdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // The QR is an embedded image.
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(pdf.length).toBeGreaterThan(5000);
  }, 20_000);

  it("renders a draft without a QR code", async () => {
    const pdf = await renderInvoicePdf({
      ...doc,
      draft: true,
      notice: "NOT SENT YET. For checking only.",
      number: "Not sent yet",
      payment: { ...doc.payment, upiLink: null },
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).not.toContain("/Subtype /Image");
  }, 20_000);
});
