import { describe, expect, it } from "vitest";
import { halfRate, invoiceDocument, pdfFileName } from "../document";
import { source } from "./fixtures";

describe("invoiceDocument", () => {
  it("prints a sent invoice from the copies made at sending, not the current details", () => {
    const doc = invoiceDocument(source());
    expect(doc.title).toBe("Tax Invoice");
    expect(doc.draft).toBe(false);
    expect(doc.number).toBe("B1/26-27/0001");
    expect(doc.supplier.name).toBe("Demo Properties LLP");
    expect(doc.supplier.gstin).toBe("27AAPFU0939F1ZV");
    // PAN is characters 3–12 of the GSTIN.
    expect(doc.supplier.pan).toBe("AAPFU0939F");
    expect(doc.recipient.name).toBe("Acme Tech Pvt Ltd");
    expect(doc.recipient.gstin).toBe("27AABCA1234A1Z5");
    expect(doc.recipient.state).toBe("Maharashtra (27)");
    expect(doc.placeOfSupply).toBe("Maharashtra (27)");
    expect(doc.invoiceDate).toBe("01-11-2026");
    expect(doc.dueDate).toBe("08-11-2026");
    expect(doc.property).toBe("Tower A, MG Road, Pune · Units 401, 402");
    expect(doc.reverseCharge).toBe("No");
    expect(doc.notice).toBeNull();
    expect(doc.copyLabel).toBe("Original for recipient");
  });

  it("prints a draft from the current details, marked as a draft with no payment QR", () => {
    const doc = invoiceDocument(
      source({
        status: "draft",
        number: null,
        supplier: null,
        recipient: null,
      }),
    );
    expect(doc.draft).toBe(true);
    expect(doc.number).toBe("Not sent yet");
    expect(doc.notice).toMatch(/^NOT SENT YET/);
    // Units sorted as numbers: 10 before 401.
    expect(doc.property).toBe(
      "Tower A (renamed later), MG Road, Pune · Units 10, 401, 402",
    );
    // A draft still shows what will be asked for, so it can be checked.
    expect(doc.payment!.toPay).toBe(
      "₹1,08,000 (total ₹1,18,000 less TDS ₹10,000)",
    );
    expect(doc.supplier.name).toBe("Demo Properties (renamed later)");
    expect(doc.recipient.name).toBe("Acme (renamed later)");
    expect(doc.recipient.gstin).toBe("Unregistered");
    expect(doc.recipient.state).toBe("Karnataka (29)");
    expect(doc.payment!.upiLink).toBeNull();
  });

  it("splits each line into CGST and SGST at half the rate within a state", () => {
    const [line] = invoiceDocument(source()).lines;
    expect(line).toEqual({
      number: "1",
      description: "Rent for Nov 2026",
      detail: null,
      sac: "997212",
      period: "01-11-2026 to 30-11-2026",
      taxable: "₹1,00,000",
      taxes: ["CGST 9% ₹9,000", "SGST 9% ₹9,000"],
      total: "₹1,18,000",
    });
    expect(invoiceDocument(source()).taxColumns).toEqual(["CGST", "SGST"]);
  });

  it("shows IGST at the full rate across states", () => {
    const s = source({
      supplyType: "inter_state",
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 1800000,
    });
    s.lines[0] = { ...s.lines[0]!, cgst: 0, sgst: 0, igst: 1800000 };
    const doc = invoiceDocument(s);
    expect(doc.lines[0]!.taxes).toEqual(["IGST 18% ₹18,000"]);
    expect(doc.taxColumns).toEqual(["IGST"]);
    expect(doc.totals.map((t) => t.label)).toEqual([
      "Taxable value",
      "IGST",
      "Total",
    ]);
  });

  it("totals with round off, and the total in words", () => {
    // ₹1,06,917.75 + ₹19,245.20 GST = ₹1,26,162.95, round off +₹0.05 → ₹1,26,163
    const doc = invoiceDocument(
      source({
        taxableTotal: 10691775,
        cgstTotal: 962260,
        sgstTotal: 962260,
        roundOff: 5,
        grandTotal: 12616300,
      }),
    );
    expect(doc.totals).toEqual([
      { label: "Taxable value", amount: "₹1,06,917.75" },
      { label: "CGST", amount: "₹9,622.60" },
      { label: "SGST", amount: "₹9,622.60" },
      { label: "Round off", amount: "₹0.05" },
      { label: "Total", amount: "₹1,26,163" },
    ]);
    expect(doc.amountInWords).toBe(
      "Rupees One Lakh Twenty Six Thousand One Hundred Sixty Three Only",
    );
  });

  it("asks for the total less expected TDS, leaving the amount out of the QR above UPI's ₹1 lakh limit", () => {
    const doc = invoiceDocument(source());
    // ₹1,18,000 − ₹10,000 TDS = ₹1,08,000: over ₹1,00,000, so no am=
    expect(doc.payment!.upiLink).toBe(
      "upi://pay?pa=demo%40okhdfcbank&pn=Demo%20Properties%20LLP&cu=INR&tn=B1%2F26-27%2F0001",
    );
    expect(doc.payment!.toPay).toBe(
      "₹1,08,000 (total ₹1,18,000 less TDS ₹10,000)",
    );
    expect(doc.payment!.rows).toEqual([
      ["Bank", "HDFC Bank"],
      ["Account name", "Demo Properties LLP"],
      ["Account number", "50100012345678"],
      ["IFSC", "HDFC0000123"],
      ["UPI ID", "demo@okhdfcbank"],
    ]);
  });

  it("puts the amount in the QR up to exactly ₹1,00,000", () => {
    // ₹1,10,000 total − ₹10,000 TDS = ₹1,00,000, at the limit
    const doc = invoiceDocument(
      source({ grandTotal: 11000000, taxableTotal: 9200000 }),
    );
    expect(doc.payment!.upiLink).toContain("&am=100000.00&");
    // ₹1,10,000.01 − ₹10,000 = ₹1,00,000.01, one paisa over
    const over = invoiceDocument(
      source({ grandTotal: 11000001, taxableTotal: 9200001 }),
    );
    expect(over.payment!.upiLink).not.toContain("am=");
  });

  it("a cancelled invoice asks for nothing and has no QR", () => {
    const doc = invoiceDocument(source({ status: "cancelled" }));
    expect(doc.notice).toBe("CANCELLED. This invoice is not payable.");
    expect(doc.payment!.toPay).toBeNull();
    expect(doc.payment!.upiLink).toBeNull();
  });

  it("a paid invoice asks for nothing and has no QR", () => {
    const doc = invoiceDocument(source({ status: "paid" }));
    expect(doc.notice).toMatch(/^PAID/);
    expect(doc.payment!.toPay).toBeNull();
    expect(doc.payment!.upiLink).toBeNull();
  });

  it("a part-paid invoice has a QR without an amount, and no amount to pay", () => {
    const doc = invoiceDocument(
      source({
        status: "part_paid",
        grandTotal: 5900000,
        taxableTotal: 5000000,
        cgstTotal: 450000,
        sgstTotal: 450000,
      }),
    );
    expect(doc.notice).toBeNull();
    expect(doc.payment!.toPay).toBeNull();
    expect(doc.payment!.upiLink).toBe(
      "upi://pay?pa=demo%40okhdfcbank&pn=Demo%20Properties%20LLP&cu=INR&tn=B1%2F26-27%2F0001",
    );
  });

  it("an overdue invoice still asks for the full amount", () => {
    // ₹59,000 total, ₹5,000 TDS → ₹54,000 in the QR
    const doc = invoiceDocument(
      source({
        status: "overdue",
        grandTotal: 5900000,
        taxableTotal: 5000000,
        cgstTotal: 450000,
        sgstTotal: 450000,
        expectedTds: 500000,
      }),
    );
    expect(doc.payment!.upiLink).toContain("&am=54000.00&");
  });

  it("refuses to print a sent invoice without its copies, rather than show current details", () => {
    expect(() => invoiceDocument(source({ recipient: null }))).toThrow(
      /missing/,
    );
    expect(() => invoiceDocument(source({ supplier: null }))).toThrow(
      /missing/,
    );
  });

  it("asks for the full total when no TDS is expected, and has no QR without a UPI ID", () => {
    const s = source({ expectedTds: 0 });
    s.invoice.supplier = { ...s.invoice.supplier!, upiId: null, ifsc: null };
    const doc = invoiceDocument(s);
    expect(doc.payment!.upiLink).toBeNull();
    expect(doc.payment!.toPay).toBe("₹1,18,000");
    expect(doc.payment!.rows.map(([k]) => k)).toEqual([
      "Bank",
      "Account name",
      "Account number",
    ]);
  });
});

describe("halfRate (CGST or SGST rate from the GST rate)", () => {
  it("halves without floats", () => {
    expect(halfRate(1800)).toBe("9%");
    expect(halfRate(1250)).toBe("6.25%");
    expect(halfRate(500)).toBe("2.5%");
    expect(halfRate(0)).toBe("0%");
    // 0.25% → 0.125% each; 18.01% → 9.005% each
    expect(halfRate(25)).toBe("0.125%");
    expect(halfRate(1801)).toBe("9.005%");
  });
});

describe("pdfFileName", () => {
  it("makes a file name from the invoice number", () => {
    expect(pdfFileName("B1/26-27/0001")).toBe("Invoice-B1-26-27-0001.pdf");
    expect(pdfFileName("Not sent yet")).toBe("Invoice-Not-sent-yet.pdf");
  });
});
