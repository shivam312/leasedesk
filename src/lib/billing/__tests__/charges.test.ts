import { describe, expect, it } from "vitest";
import { chargeBaseAmount, withChargeDefaults } from "../charges";
import type { Charge } from "../types";

const base = {
  id: "c1",
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
} as const;

describe("chargeBaseAmount", () => {
  it("fixed: the amount as entered", () => {
    const charge: Charge = {
      ...base,
      type: "rent",
      basis: "fixed",
      amountPaise: 10_000_000,
    };
    // ₹1,00,000 per month
    const { amount, explanation } = chargeBaseAmount(charge);
    expect(amount).toBe(10_000_000);
    expect(explanation.steps).toEqual(["Fixed amount: ₹1,00,000 per month"]);
  });

  it("per sq ft: rate × area, rounded to the paisa", () => {
    const charge: Charge = {
      ...base,
      type: "rent",
      basis: "per_sqft",
      ratePaise: 8550,
      areaHundredths: 125_050,
    };
    // 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75
    const { amount, explanation } = chargeBaseAmount(charge);
    expect(amount).toBe(10_691_775);
    expect(explanation.steps).toEqual([
      "1,250.50 sq ft × ₹85.50 = ₹1,06,917.75 per month",
    ]);
  });

  it("per sq ft: rounds a fractional paisa half up", () => {
    const charge: Charge = {
      ...base,
      type: "cam",
      basis: "per_sqft",
      ratePaise: 1225,
      areaHundredths: 98_765,
    };
    // 987.65 sq ft × ₹12.25 = ₹12,098.7125 → ₹12,098.71
    expect(chargeBaseAmount(charge).amount).toBe(1_209_871);
  });

  it("per slot: rate × number of slots", () => {
    const charge: Charge = {
      ...base,
      type: "parking",
      basis: "per_slot",
      ratePaise: 350_000,
      slots: 4,
    };
    // 4 slots × ₹3,500 = ₹14,000
    const { amount, explanation } = chargeBaseAmount(charge);
    expect(amount).toBe(1_400_000);
    expect(explanation.steps).toEqual(["4 slots × ₹3,500 = ₹14,000 per month"]);
  });

  it("fixed quarterly: the amount is per quarter", () => {
    const charge: Charge = {
      ...base,
      type: "cam",
      basis: "fixed",
      amountPaise: 3_000_000,
      frequency: "quarterly",
    };
    // ₹30,000 per quarter
    const { amount, explanation } = chargeBaseAmount(charge);
    expect(amount).toBe(3_000_000);
    expect(explanation.steps).toEqual(["Fixed amount: ₹30,000 per quarter"]);
  });

  it("refuses quarterly per sq ft or per slot (not defined in the rules)", () => {
    const charge: Charge = {
      ...base,
      type: "cam",
      basis: "per_sqft",
      ratePaise: 1000,
      areaHundredths: 100_000,
      frequency: "quarterly",
    };
    expect(() => chargeBaseAmount(charge)).toThrow(/quarterly/);
  });

  it("rejects negative amounts, zero area and fractional slots", () => {
    expect(() =>
      chargeBaseAmount({
        ...base,
        type: "rent",
        basis: "fixed",
        amountPaise: -1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      chargeBaseAmount({
        ...base,
        type: "rent",
        basis: "per_sqft",
        ratePaise: 8550,
        areaHundredths: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      chargeBaseAmount({
        ...base,
        type: "parking",
        basis: "per_slot",
        ratePaise: 350_000,
        slots: 1.5,
      }),
    ).toThrow(RangeError);
  });
});

describe("withChargeDefaults", () => {
  it("applies the defaults from section 3", () => {
    const rent = withChargeDefaults({
      ...base,
      type: "rent",
      basis: "fixed",
      amountPaise: 1,
    });
    expect(rent.frequency).toBe("monthly");
    expect(rent.timing).toBe("advance");
    expect(rent.waivedDuringRentFree).toBe(true);

    const cam = withChargeDefaults({
      ...base,
      type: "cam",
      basis: "fixed",
      amountPaise: 1,
    });
    expect(cam.waivedDuringRentFree).toBe(false);
  });

  it("keeps values that were set", () => {
    const cam = withChargeDefaults({
      ...base,
      type: "cam",
      basis: "fixed",
      amountPaise: 1,
      frequency: "quarterly",
      timing: "arrears",
      waivedDuringRentFree: true,
    });
    expect(cam).toMatchObject({
      frequency: "quarterly",
      timing: "arrears",
      waivedDuringRentFree: true,
    });
  });
});
