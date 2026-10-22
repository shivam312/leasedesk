import { describe, expect, it } from "vitest";
import { gstinStateCode, invoiceTotals, lineTax, supplyType } from "../gst";

describe("place of supply", () => {
  it("reads the state code from the first two digits of a GSTIN", () => {
    expect(gstinStateCode("27AAPFU0939F1ZV")).toBe("27");
    expect(() => gstinStateCode("27AAPFU0939F1Z")).toThrow(/GSTIN/);
    expect(() => gstinStateCode("XXAAPFU0939F1ZV")).toThrow(/GSTIN/);
  });

  it("is intra-state when the billing GSTIN's state is the building's state", () => {
    expect(
      supplyType({ billingGstin: "27AAPFU0939F1ZV", buildingStateCode: "27" }),
    ).toBe("intra_state");
    expect(
      supplyType({ billingGstin: "29AAPFU0939F1ZV", buildingStateCode: "27" }),
    ).toBe("inter_state");
  });
});

describe("lineTax", () => {
  it("golden 7: same state, ₹1,00,000 → CGST ₹9,000 + SGST ₹9,000", () => {
    // 9% of ₹1,00,000 = ₹9,000 each
    expect(lineTax(10_000_000, 1800, "intra_state")).toMatchObject({
      cgst: 900_000,
      sgst: 900_000,
      igst: 0,
    });
  });

  it("golden 8: different state, ₹1,00,000 → IGST ₹18,000", () => {
    expect(lineTax(10_000_000, 1800, "inter_state")).toMatchObject({
      cgst: 0,
      sgst: 0,
      igst: 1_800_000,
    });
  });

  it("rounds each tax to the paisa separately", () => {
    // 9% of ₹1,06,917.75 = ₹9,622.5975 → ₹9,622.60 each side
    const tax = lineTax(10_691_775, 1800, "intra_state");
    expect(tax).toMatchObject({ cgst: 962_260, sgst: 962_260, igst: 0 });
    expect(tax.explanation.steps).toEqual([
      "CGST 9% of ₹1,06,917.75 = ₹9,622.60",
      "SGST 9% of ₹1,06,917.75 = ₹9,622.60",
    ]);
  });

  it("halves odd rates exactly", () => {
    // 12.5% → 6.25% each: ₹1,234.56 × 6.25% = ₹77.16 each
    expect(lineTax(123_456, 1250, "intra_state")).toMatchObject({
      cgst: 7716,
      sgst: 7716,
    });
  });

  it("is zero at a 0% rate", () => {
    expect(lineTax(10_000_000, 0, "intra_state")).toMatchObject({
      cgst: 0,
      sgst: 0,
      igst: 0,
    });
  });

  it("rejects a negative or fractional rate", () => {
    expect(() => lineTax(100, -1, "intra_state")).toThrow(RangeError);
    expect(() => lineTax(100, 18.5, "intra_state")).toThrow(RangeError);
  });
});

describe("invoiceTotals", () => {
  it("golden 9: ₹1,06,917.75 + 18% GST, rounded to the rupee with a round-off line", () => {
    const tax = lineTax(10_691_775, 1800, "intra_state");
    // 1,06,917.75 + 9,622.60 + 9,622.60 = 1,26,162.95 → ₹1,26,163, round off +₹0.05
    expect(
      invoiceTotals([{ taxablePaise: 10_691_775, ...tax }], {
        roundInvoiceTotal: true,
      }),
    ).toEqual({
      taxable: 10_691_775,
      cgst: 962_260,
      sgst: 962_260,
      igst: 0,
      subtotal: 12_616_295,
      roundOff: 5,
      grandTotal: 12_616_300,
    });
  });

  it("adds tax line by line on a split month", () => {
    // 36,129.03 × 9% = 3,251.6127 → 3,251.61; 46,064.52 × 9% = 4,145.8068 → 4,145.81
    // CGST = SGST = 7,397.42; subtotal 82,193.55 + 14,794.84 = 96,988.39
    // → ₹96,988, round off −₹0.39
    const lines = [3_612_903, 4_606_452].map((taxablePaise) => ({
      taxablePaise,
      ...lineTax(taxablePaise, 1800, "intra_state"),
    }));
    expect(invoiceTotals(lines, { roundInvoiceTotal: true })).toEqual({
      taxable: 8_219_355,
      cgst: 739_742,
      sgst: 739_742,
      igst: 0,
      subtotal: 9_698_839,
      roundOff: -39,
      grandTotal: 9_698_800,
    });
  });

  it("has no round-off when the setting is off", () => {
    const tax = lineTax(10_691_775, 1800, "intra_state");
    expect(
      invoiceTotals([{ taxablePaise: 10_691_775, ...tax }], {
        roundInvoiceTotal: false,
      }),
    ).toMatchObject({ roundOff: 0, grandTotal: 12_616_295 });
  });
});
