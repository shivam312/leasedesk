// tds.rounding, tds.tolerancePaise and tds.quarterBasis (docs/SETTINGS.md,
// D-003) [CA], every option.

import { describe, expect, it } from "vitest";
import {
  expectedTds,
  settlePayment,
  tdsQuarter,
  tenantTdsDefaults,
} from "../tds";
import { withSettings } from "./billing-settings";

const company = tenantTdsDefaults({ deductsTds: true });

describe("tds.rounding", () => {
  const one = [{ chargeType: "rent" as const, taxablePaise: 10_691_775 }];
  // Rent ₹1,06,917.75 at 10% = ₹10,691.775
  it("rupee (default): ₹10,691.775 → ₹10,692", () => {
    expect(
      expectedTds({
        lines: one,
        tds: company,
        settings: withSettings({ tdsRounding: "rupee" }),
      }).amount,
    ).toBe(1_069_200);
  });

  it("paisa: ₹10,691.775 → ₹10,691.78", () => {
    expect(
      expectedTds({
        lines: one,
        tds: company,
        settings: withSettings({ tdsRounding: "paisa" }),
      }).amount,
    ).toBe(1_069_178);
  });

  it("paisa rounds once on the sum of the types, like rupee", () => {
    // Rent ₹1,00,000.55 at 10% = 10,000.055; CAM ₹15,318.63 at 2% = 306.3726
    // Sum 10,306.4276 → paisa ₹10,306.43 (rounding each first: 10,000.06 + 306.37 = 10,306.43 too,
    // so also check the rupee result: ₹10,306)
    const tds = { ...company, cam: { deductsTds: true, tdsRateBp: 200 } };
    const lines = [
      { chargeType: "rent" as const, taxablePaise: 10_000_055 },
      { chargeType: "cam" as const, taxablePaise: 1_531_863 },
    ];
    expect(
      expectedTds({
        lines,
        tds,
        settings: withSettings({ tdsRounding: "paisa" }),
      }).amount,
    ).toBe(1_030_643);
    expect(
      expectedTds({
        lines,
        tds,
        settings: withSettings({ tdsRounding: "rupee" }),
      }).amount,
    ).toBe(1_030_600);
  });

  it("paisa: the explanation says to the nearest paisa", () => {
    expect(
      expectedTds({
        lines: one,
        tds: company,
        settings: withSettings({ tdsRounding: "paisa" }),
      }).explanation.steps.at(-1),
    ).toContain("to the nearest paisa");
  });
});

describe("tds.tolerancePaise", () => {
  // Invoice ₹1,26,163, expected TDS ₹10,692.
  const settle = (receivedPaise: number, tdsTolerancePaise: number) =>
    settlePayment({
      invoiceTotalPaise: 12_616_300,
      receivedPaise,
      expectedTdsPaise: 1_069_200,
      settings: withSettings({ tdsTolerancePaise }),
    }).status;

  it("100 (default, ₹1): short by ₹10,693 (₹1 more than expected) is paid with TDS", () => {
    // 1,26,163 − 1,15,470 = 10,693; |10,693 − 10,692| = ₹1 ≤ ₹1
    expect(settle(11_547_000, 100)).toBe("paid_with_tds");
    // Short by ₹10,694: ₹2 off → part-paid
    expect(settle(11_546_900, 100)).toBe("part_paid");
  });

  it("0: only the exact expected TDS counts", () => {
    expect(settle(11_547_100, 0)).toBe("paid_with_tds"); // short exactly ₹10,692
    expect(settle(11_547_000, 0)).toBe("part_paid");
  });

  it("500 (₹5): short by ₹10,697 still counts", () => {
    // 1,26,163 − 1,15,466 = 10,697; ₹5 off
    expect(settle(11_546_600, 500)).toBe("paid_with_tds");
    expect(settle(11_546_500, 500)).toBe("part_paid");
  });
});

describe("tds.quarterBasis", () => {
  // Invoice 25 Mar 2027 (Jan–Mar 2027, Q4 of 2026-27), paid 5 Apr 2027 (Q1 of 2027-28).
  it("payment_date (default): Q1 of 2027-28", () => {
    expect(
      tdsQuarter({
        paymentDate: "2027-04-05",
        invoiceDate: "2027-03-25",
        settings: withSettings({ tdsQuarterBasis: "payment_date" }),
      }),
    ).toEqual({ financialYear: "2027-28", quarter: 1 });
  });

  it("invoice_date: Q4 of 2026-27", () => {
    expect(
      tdsQuarter({
        paymentDate: "2027-04-05",
        invoiceDate: "2027-03-25",
        settings: withSettings({ tdsQuarterBasis: "invoice_date" }),
      }),
    ).toEqual({ financialYear: "2026-27", quarter: 4 });
  });
});

describe("review follow-ups", () => {
  it("paisa: rounds once on the sum, not each type first", () => {
    // Rent 5 paise at 10% = 0.5 paise; CAM 5 paise at 10% = 0.5 paise.
    // Once on the sum: 1.0 → 1 paisa. Each first: 1 + 1 = 2 paise (wrong).
    const lines = [
      { chargeType: "rent" as const, taxablePaise: 5 },
      { chargeType: "cam" as const, taxablePaise: 5 },
    ];
    expect(
      expectedTds({
        lines,
        tds: company,
        settings: withSettings({ tdsRounding: "paisa" }),
      }).amount,
    ).toBe(1);
  });

  it("refuses a negative or fractional tolerance", () => {
    const settle = (tdsTolerancePaise: number) =>
      settlePayment({
        invoiceTotalPaise: 12_616_300,
        receivedPaise: 11_547_100,
        expectedTdsPaise: 1_069_200,
        settings: withSettings({ tdsTolerancePaise }),
      });
    expect(() => settle(-1)).toThrow(RangeError);
    expect(() => settle(100.5)).toThrow(RangeError);
  });
});
