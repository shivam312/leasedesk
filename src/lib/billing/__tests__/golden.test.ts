/**
 * Golden test cases: docs/BILLING_RULES.md, section 13. These must pass at
 * all times. Add one for every billing bug found.
 */
import { describe, expect, it } from "vitest";
import { chargeBaseAmount } from "../charges";
import { amountSteps } from "../escalation";
import { invoiceTotals, lineTax } from "../gst";
import { invoiceForRun } from "../invoice-lines";
import { invoiceNumber } from "../invoice-number";
import { rentSchedule } from "../schedule";
import type { LeaseInput } from "../schedule";
import { expectedTds, settlePayment, tdsQuarter } from "../tds";
import type { Charge } from "../types";

const settings = { roundEscalatedRentToRupee: true, dueDays: 7 };

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 10_000_000, // ₹1,00,000
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

function lines(lease: LeaseInput, month: string) {
  return (
    invoiceForRun(lease, month, settings)?.lines.map((l) => [
      l.chargeId,
      l.taxablePaise,
    ]) ?? []
  );
}

describe("golden test cases (BILLING_RULES.md §13)", () => {
  it("1. ₹1,00,000, 5% every 12 months compounding, 3 years → ₹1,00,000 / ₹1,05,000 / ₹1,10,250", () => {
    const schedule = rentSchedule(
      {
        id: "G1",
        startDate: "2026-04-01",
        endDate: "2029-03-31",
        charges: [rent],
        escalationRules: [
          { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
        ],
      },
      settings,
    );
    // 1,00,000 × 1.05 = 1,05,000; 1,05,000 × 1.05 = 1,10,250
    const byYear = [0, 12, 24].map((i) => schedule.periods[i]?.amount);
    expect(byYear).toEqual([10_000_000, 10_500_000, 11_025_000]);
    expect(schedule.periods).toHaveLength(36);
  });

  it("2. 1,250.50 sq ft × ₹85.50 → ₹1,06,917.75 per month", () => {
    // 125050 × 8550 ÷ 100 = 10,691,775 paise
    expect(
      chargeBaseAmount({
        ...rent,
        basis: "per_sqft",
        ratePaise: 8550,
        areaHundredths: 125_050,
      }).amount,
    ).toBe(10_691_775);
  });

  it("3. rent-free 3 months from 1 Jan 2027 → first rent invoice April 2027; CAM from January", () => {
    const lease: LeaseInput = {
      id: "G3",
      startDate: "2027-01-01",
      endDate: "2029-12-31",
      rentFreeMonths: 3,
      charges: [
        { ...rent, amountPaise: 20_000_000, startDate: "2027-01-01" },
        {
          ...rent,
          id: "cam",
          type: "cam",
          amountPaise: 2_500_000,
          startDate: "2027-01-01",
        },
      ],
    };
    expect(lines(lease, "2027-01")).toEqual([["cam", 2_500_000]]);
    expect(lines(lease, "2027-03")).toEqual([["cam", 2_500_000]]);
    expect(lines(lease, "2027-04")).toEqual([
      ["rent", 20_000_000],
      ["cam", 2_500_000],
    ]);
  });

  it("4. rent commencement 16 Sep → September pro-rated 15/30", () => {
    const lease: LeaseInput = {
      id: "G4",
      startDate: "2026-09-01",
      endDate: "2029-08-31",
      rentFreeDays: 15,
      charges: [{ ...rent, amountPaise: 9_000_000, startDate: "2026-09-01" }],
    };
    // 1 Sep + 15 days = 16 Sep; ₹90,000 × 15 / 30 = ₹45,000
    expect(lines(lease, "2026-09")).toEqual([["rent", 4_500_000]]);
  });

  it("5. increase effective 15 Mar on ₹80,000 → 14 days at ₹80,000 and 17 days at the new rent", () => {
    const lease: LeaseInput = {
      id: "G5",
      startDate: "2025-03-15",
      endDate: "2028-03-14",
      charges: [{ ...rent, amountPaise: 8_000_000, startDate: "2025-03-15" }],
      escalationRules: [
        { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
      ],
    };
    // New rent 80,000 × 1.05 = 84,000.
    // 14 × 80,000 / 31 = 36,129.03; 17 × 84,000 / 31 = 46,064.52
    expect(lines(lease, "2026-03")).toEqual([
      ["rent", 3_612_903],
      ["rent", 4_606_452],
    ]);
  });

  it("6. 15% every 36 months, non-compounding → ₹1,15,000 in years 4–6, ₹1,30,000 in years 7–9", () => {
    const steps = amountSteps({
      charge: rent,
      lease: { id: "G6", startDate: "2026-04-01", endDate: "2035-03-31" },
      rules: [
        {
          percentBp: 1500,
          everyMonths: 36,
          anchor: "lease_start",
          compounding: false,
        },
      ],
      roundEscalatedRentToRupee: true,
    });
    // 1,00,000 × 1.15 = 1,15,000; 1,00,000 × 1.30 = 1,30,000
    expect(steps.map((s) => [s.from, s.amount])).toEqual([
      ["2026-04-01", 10_000_000],
      ["2029-04-01", 11_500_000],
      ["2032-04-01", 13_000_000],
    ]);
  });

  it("7. GST same state: ₹1,00,000 → CGST ₹9,000, SGST ₹9,000, total ₹1,18,000", () => {
    const tax = lineTax(10_000_000, 1800, "intra_state");
    const totals = invoiceTotals([{ taxablePaise: 10_000_000, ...tax }], {
      roundInvoiceTotal: true,
    });
    expect(totals).toMatchObject({
      cgst: 900_000,
      sgst: 900_000,
      igst: 0,
      roundOff: 0,
      grandTotal: 11_800_000,
    });
  });

  it("8. GST different state: ₹1,00,000 → IGST ₹18,000", () => {
    expect(lineTax(10_000_000, 1800, "inter_state")).toMatchObject({
      cgst: 0,
      sgst: 0,
      igst: 1_800_000,
    });
  });

  it("9. ₹1,06,917.75 + 18% GST → CGST ₹9,622.60 each side, round-off to the rupee", () => {
    const tax = lineTax(10_691_775, 1800, "intra_state");
    // 9% × 1,06,917.75 = 9,622.5975 → 9,622.60; subtotal 1,26,162.95
    // → grand total 1,26,163.00 with round off +0.05
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

  it("10. quarterly CAM ₹30,000, lease from 15 May → first bill pro-rated for 15 May–30 Jun", () => {
    const lease: LeaseInput = {
      id: "G10",
      startDate: "2026-05-15",
      endDate: "2029-05-14",
      charges: [
        {
          ...rent,
          id: "cam",
          type: "cam",
          amountPaise: 3_000_000,
          startDate: "2026-05-15",
          frequency: "quarterly",
        },
      ],
    };
    const invoice = invoiceForRun(lease, "2026-05", settings);
    // Month by month at 30,000 ÷ 3 = 10,000 a month:
    // May 17/31 days: 30,000 × 17 / (3 × 31) = 5,483.870… → 5,483.87
    // June, a full month: 10,000.00. Total 15,483.87
    expect(invoice?.lines).toMatchObject([
      {
        periodStart: "2026-05-15",
        periodEnd: "2026-06-30",
        taxablePaise: 1_548_387,
      },
    ]);
  });

  it("11. lease ends 20 Nov → November billed for 20 days", () => {
    const lease: LeaseInput = {
      id: "G11",
      startDate: "2024-11-21",
      endDate: "2026-11-20",
      charges: [{ ...rent, amountPaise: 9_000_000, startDate: "2024-11-21" }],
    };
    // 90,000 × 20 / 30 = 60,000
    expect(invoiceForRun(lease, "2026-11", settings)?.lines).toMatchObject([
      {
        periodStart: "2026-11-01",
        periodEnd: "2026-11-20",
        taxablePaise: 6_000_000,
      },
    ]);
  });

  it("12. ₹1,08,000 paid against ₹1,18,000 with ₹10,000 expected TDS → paid with TDS, TDS record ₹10,000", () => {
    // TDS 10% of taxable 1,00,000 = 10,000; 1,08,000 + 10,000 = 1,18,000
    const tds = expectedTds({
      taxablePaise: 10_000_000,
      tdsRateBp: 1000,
      deductsTds: true,
    });
    const result = settlePayment({
      invoiceTotalPaise: 11_800_000,
      receivedPaise: 10_800_000,
      expectedTdsPaise: tds.amount,
    });
    expect(result).toMatchObject({
      status: "paid_with_tds",
      tdsDeductedPaise: 1_000_000,
      settledPaise: 11_800_000,
    });
    expect(tdsQuarter("2026-10-05")).toEqual({
      financialYear: "2026-27",
      quarter: 3,
    });
  });

  it("13. the 10,000th invoice in FY 26-27 with prefix B1 stays ≤ 16 characters", () => {
    const number = invoiceNumber({
      prefix: "B1",
      invoiceDate: "2027-03-31",
      sequence: 10_000,
    });
    expect(number).toBe("B1/26-27/10000");
    expect(number.length).toBeLessThanOrEqual(16);
    expect(
      invoiceNumber({ prefix: "B1", invoiceDate: "2026-04-01", sequence: 1 }),
    ).toBe("B1/26-27/0001");
    // Too long for the 16-character limit
    expect(() =>
      invoiceNumber({
        prefix: "TOWERB",
        invoiceDate: "2026-04-01",
        sequence: 1_000_000,
      }),
    ).toThrow(/16/);
  });
});
