import { describe, expect, it } from "vitest";
import {
  creditNoteAmounts,
  creditNoteDeadline,
  type CreditableLine,
} from "../credit-note";

// The invoice: rent 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75, CGST and SGST
// 9% each = ₹9,622.60 (₹9,622.5975 rounded); maintenance ₹12,000, CGST and
// SGST ₹1,080 each. Total ₹1,40,322.95, round off +₹0.05 → ₹1,40,323.
const rent: CreditableLine = {
  id: "rent",
  description: "Rent for Nov 2026",
  taxablePaise: 10691775,
  gstRateBp: 1800,
  cgst: 962260,
  sgst: 962260,
  igst: 0,
  credited: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
};
const cam: CreditableLine = {
  id: "cam",
  description: "Maintenance (CAM) for Nov 2026",
  taxablePaise: 1200000,
  gstRateBp: 1800,
  cgst: 108000,
  sgst: 108000,
  igst: 0,
  credited: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
};
const invoice = {
  supply: "intra_state" as const,
  roundOff: 5,
  creditedRoundOff: 0,
  lines: [rent, cam],
};

describe("creditNoteAmounts", () => {
  it("reverses a whole invoice exactly, tax and round off as charged", () => {
    const cn = creditNoteAmounts({
      ...invoice,
      request: [
        { lineId: "rent", taxablePaise: 10691775 },
        { lineId: "cam", taxablePaise: 1200000 },
      ],
    });
    expect(cn.lines.map((l) => [l.cgst, l.sgst, l.igst])).toEqual([
      [962260, 962260, 0],
      [108000, 108000, 0],
    ]);
    // ₹1,06,917.75 + ₹12,000 + ₹21,404.20 tax + ₹0.05 = ₹1,40,323
    expect(cn.totals).toEqual({
      taxable: 11891775,
      cgst: 1070260,
      sgst: 1070260,
      igst: 0,
      roundOff: 5,
      total: 14032300,
    });
    expect(cn.fullyCredited).toBe(true);
  });

  it("works GST out on a part credit at the line's rate, with no round off", () => {
    // Waive ₹5,000 of maintenance: 9% of ₹5,000 = ₹450 CGST and ₹450 SGST.
    const cn = creditNoteAmounts({
      ...invoice,
      request: [{ lineId: "cam", taxablePaise: 500000 }],
    });
    expect(cn.lines).toHaveLength(1);
    expect(cn.lines[0]).toMatchObject({
      invoiceLineId: "cam",
      description: "Maintenance (CAM) for Nov 2026",
      taxablePaise: 500000,
      gstRateBp: 1800,
      cgst: 45000,
      sgst: 45000,
      igst: 0,
    });
    expect(cn.totals).toEqual({
      taxable: 500000,
      cgst: 45000,
      sgst: 45000,
      igst: 0,
      roundOff: 0,
      total: 590000,
    });
    expect(cn.fullyCredited).toBe(false);
    expect(cn.lines[0]!.explanation.steps).toContain(
      "CGST 9% of ₹5,000 = ₹450",
    );
  });

  it("credits the rest of a line exactly after an earlier part credit", () => {
    // Earlier: ₹5,000 + ₹450 + ₹450 of maintenance. Left: ₹7,000, ₹630, ₹630.
    const partlyCredited = {
      ...cam,
      credited: { taxable: 500000, cgst: 45000, sgst: 45000, igst: 0 },
    };
    const cn = creditNoteAmounts({
      ...invoice,
      lines: [rent, partlyCredited],
      request: [{ lineId: "cam", taxablePaise: 700000 }],
    });
    expect(cn.lines[0]).toMatchObject({ cgst: 63000, sgst: 63000 });
    expect(cn.fullyCredited).toBe(false);
  });

  it("reverses the round off only with the last of the invoice", () => {
    const creditedRent = {
      ...rent,
      credited: { taxable: 10691775, cgst: 962260, sgst: 962260, igst: 0 },
    };
    const cn = creditNoteAmounts({
      ...invoice,
      lines: [creditedRent, cam],
      request: [{ lineId: "cam", taxablePaise: 1200000 }],
    });
    // ₹12,000 + ₹2,160 + ₹0.05 = ₹14,160.05
    expect(cn.totals.roundOff).toBe(5);
    expect(cn.totals.total).toBe(1416005);
    expect(cn.fullyCredited).toBe(true);
  });

  it("leaves the round off out of a last credit note it would bring to zero or below", () => {
    // Invoice: ₹10,000.20 + 9% + 9% (₹900.02 each, 90001.8 rounded) =
    // ₹11,800.24, round off −₹0.24 → ₹11,800. An earlier part credit took
    // ₹10,000 + ₹900 + ₹900. Left: ₹0.20 + ₹0.02 + ₹0.02 = ₹0.24, and
    // reversing −₹0.24 round off would make the credit note ₹0. So it has
    // no round off: ₹0.24.
    const tiny: CreditableLine = {
      id: "x",
      description: "Rent",
      taxablePaise: 1000020,
      gstRateBp: 1800,
      cgst: 90002,
      sgst: 90002,
      igst: 0,
      credited: { taxable: 1000000, cgst: 90000, sgst: 90000, igst: 0 },
    };
    const cn = creditNoteAmounts({
      supply: "intra_state",
      roundOff: -24,
      creditedRoundOff: 0,
      lines: [tiny],
      request: [{ lineId: "x", taxablePaise: 20 }],
    });
    expect(cn.totals).toMatchObject({ roundOff: 0, total: 24 });
    expect(cn.fullyCredited).toBe(true);
  });

  it("uses IGST when the invoice did", () => {
    // ₹10,000 at 18% IGST = ₹1,800.
    const igstLine: CreditableLine = {
      ...cam,
      cgst: 0,
      sgst: 0,
      igst: 216000,
    };
    const cn = creditNoteAmounts({
      supply: "inter_state",
      roundOff: 0,
      creditedRoundOff: 0,
      lines: [igstLine],
      request: [{ lineId: "cam", taxablePaise: 1000000 }],
    });
    expect(cn.totals).toMatchObject({ cgst: 0, sgst: 0, igst: 180000 });
  });

  it("refuses more than is left on a line, nothing, or an unknown line", () => {
    expect(() =>
      creditNoteAmounts({
        ...invoice,
        request: [{ lineId: "cam", taxablePaise: 1200001 }],
      }),
    ).toThrow(/₹12,000/);
    expect(() =>
      creditNoteAmounts({
        ...invoice,
        request: [{ lineId: "cam", taxablePaise: 0 }],
      }),
    ).toThrow(/Enter/);
    expect(() =>
      creditNoteAmounts({
        ...invoice,
        request: [{ lineId: "nope", taxablePaise: 100 }],
      }),
    ).toThrow(/line/);
    expect(() =>
      creditNoteAmounts({
        ...invoice,
        request: [{ lineId: "cam", taxablePaise: -100 }],
      }),
    ).toThrow();
  });
});

describe("creditNoteDeadline [CA]", () => {
  it("is 30 November after the end of the invoice's financial year", () => {
    expect(creditNoteDeadline("2026-11-01")).toBe("2027-11-30");
    expect(creditNoteDeadline("2027-03-31")).toBe("2027-11-30");
    expect(creditNoteDeadline("2027-04-01")).toBe("2028-11-30");
  });
});
