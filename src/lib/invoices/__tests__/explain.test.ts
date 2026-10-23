import { describe, expect, it } from "vitest";
import { lineWorking, totalWorking } from "../explain";

const working = {
  amount: {
    rule: "Rent per sq ft",
    steps: ["1,250.50 sq ft × ₹85.50 = ₹1,06,917.75"],
    result: 10691775,
  },
  tax: {
    rule: "CGST + SGST: billing GSTIN is in the building's state",
    steps: ["CGST 9% of ₹1,06,917.75 = ₹9,622.60"],
    result: 1924520,
  },
};

describe("lineWorking", () => {
  it("returns the saved working", () => {
    expect(lineWorking(working)).toEqual(working);
  });

  it("returns null for a missing or malformed working, never a guess", () => {
    expect(lineWorking(null)).toBeNull();
    expect(lineWorking({ amount: working.amount })).toBeNull();
    expect(
      lineWorking({ ...working, tax: { rule: "x", steps: "y" } }),
    ).toBeNull();
  });
});

describe("totalWorking", () => {
  const base = {
    supplyType: "intra_state" as const,
    // ₹1,00,000 + 9% CGST ₹9,000 + 9% SGST ₹9,000 = ₹1,18,000
    taxableTotal: 10000000,
    cgstTotal: 900000,
    sgstTotal: 900000,
    igstTotal: 0,
    roundOff: 0,
    grandTotal: 11800000,
  };

  it("adds the taxable value and each tax", () => {
    expect(totalWorking(base)).toEqual({
      rule: "Every line's amount plus its GST",
      steps: ["₹1,00,000 before GST + CGST ₹9,000 + SGST ₹9,000 = ₹1,18,000"],
      result: 11800000,
    });
  });

  it("shows IGST for another state, and the round off either way", () => {
    // ₹1,06,917.75 + 18% IGST ₹19,245.20 = ₹1,26,162.95; +₹0.05 → ₹1,26,163.
    expect(
      totalWorking({
        ...base,
        supplyType: "inter_state",
        taxableTotal: 10691775,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 1924520,
        roundOff: 5,
        grandTotal: 12616300,
      }).steps,
    ).toEqual([
      "₹1,06,917.75 before GST + IGST ₹19,245.20 = ₹1,26,162.95",
      "Rounded to the nearest rupee: ₹1,26,162.95 + ₹0.05 round off = ₹1,26,163",
    ]);
    // ₹1,26,163.45 − ₹0.45 → ₹1,26,163.
    expect(
      totalWorking({
        ...base,
        taxableTotal: 10691775,
        cgstTotal: 962285,
        sgstTotal: 962285,
        roundOff: -45,
        grandTotal: 12616300,
      }).steps[1],
    ).toBe(
      "Rounded to the nearest rupee: ₹1,26,163.45 − ₹0.45 round off = ₹1,26,163",
    );
  });
});
