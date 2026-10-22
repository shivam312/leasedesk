import { describe, expect, it } from "vitest";
import {
  increaseByPercent,
  mulDiv,
  percentOf,
  perUnitMonthly,
  prorate,
  roundToRupee,
  roundOffToRupee,
  sumPaise,
} from "../money";

describe("mulDiv (round half up to the paisa)", () => {
  it("rounds .5 up and below .5 down", () => {
    // 5 × 1 / 2 = 2.5 → 3
    expect(mulDiv(5, 1, 2)).toBe(3);
    // 7 × 1 / 3 = 2.333 → 2
    expect(mulDiv(7, 1, 3)).toBe(2);
    // 8 × 1 / 3 = 2.667 → 3
    expect(mulDiv(8, 1, 3)).toBe(3);
  });

  it("rounds negatives symmetrically (half away from zero)", () => {
    // credit notes: -2.5 → -3, mirroring +2.5 → +3
    expect(mulDiv(-5, 1, 2)).toBe(-3);
    expect(mulDiv(-7, 1, 3)).toBe(-2);
  });

  it("is exact for intermediates beyond 2^53", () => {
    // ₹10 crore × 31 days × 10,000 never loses precision: computed in bigint
    expect(mulDiv(1_000_000_000_00, 31 * 10_000, 31 * 10_000)).toBe(
      1_000_000_000_00,
    );
  });

  it("rejects non-integer or unsafe inputs and a non-positive divisor", () => {
    expect(() => mulDiv(10.5, 1, 1)).toThrow(RangeError);
    expect(() => mulDiv(2 ** 53, 1, 1)).toThrow(RangeError);
    expect(() => mulDiv(1, 1, 0)).toThrow(RangeError);
    expect(() => mulDiv(1, 1, -2)).toThrow(RangeError);
  });

  it("rejects a result beyond the safe integer range", () => {
    expect(() => mulDiv(2 ** 52, 4, 1)).toThrow(RangeError);
  });
});

describe("percentOf", () => {
  it("takes basis points of an amount, rounded to the paisa", () => {
    // 18% of ₹1,00,000 = ₹18,000
    expect(percentOf(10_000_000, 1800)).toBe(1_800_000);
    // 9% of ₹1,06,917.75 = ₹9,622.5975 → ₹9,622.60
    expect(percentOf(10_691_775, 900)).toBe(962_260);
  });
});

describe("increaseByPercent", () => {
  it("adds basis points to an amount", () => {
    // ₹1,10,250 × 1.05 = ₹1,15,762.50
    expect(increaseByPercent(11_025_000, 500)).toBe(11_576_250);
    // 12.5% on ₹80,000 = ₹90,000
    expect(increaseByPercent(8_000_000, 1250)).toBe(9_000_000);
  });
});

describe("roundToRupee", () => {
  it("rounds to the nearest whole rupee, half up", () => {
    // ₹1,15,762.50 → ₹1,15,763
    expect(roundToRupee(11_576_250)).toBe(11_576_300);
    // ₹1,21,551.15 → ₹1,21,551
    expect(roundToRupee(12_155_115)).toBe(12_155_100);
    expect(roundToRupee(12_155_149)).toBe(12_155_100);
    expect(roundToRupee(0)).toBe(0);
  });
});

describe("roundOffToRupee", () => {
  it("returns the rounded total and the round-off line", () => {
    // ₹1,26,162.95 → ₹1,26,163.00, round off +₹0.05
    expect(roundOffToRupee(12_616_295)).toEqual({
      rounded: 12_616_300,
      roundOff: 5,
    });
    // ₹1,18,000.40 → ₹1,18,000.00, round off −₹0.40
    expect(roundOffToRupee(11_800_040)).toEqual({
      rounded: 11_800_000,
      roundOff: -40,
    });
  });
});

describe("prorate", () => {
  it("bills actual days over days in the month", () => {
    // ₹90,000 × 15 / 30 = ₹45,000
    expect(prorate(9_000_000, 15, 30)).toBe(4_500_000);
    // ₹80,000 × 14 / 31 = ₹36,129.032 → ₹36,129.03
    expect(prorate(8_000_000, 14, 31)).toBe(3_612_903);
    // ₹84,000 × 17 / 31 = ₹46,064.516 → ₹46,064.52
    expect(prorate(8_400_000, 17, 31)).toBe(4_606_452);
  });

  it("returns the full amount for a full month and zero for no days", () => {
    expect(prorate(8_000_000, 31, 31)).toBe(8_000_000);
    expect(prorate(8_000_000, 0, 31)).toBe(0);
  });

  it("rejects days outside 0..total", () => {
    expect(() => prorate(8_000_000, 32, 31)).toThrow(RangeError);
    expect(() => prorate(8_000_000, -1, 31)).toThrow(RangeError);
  });
});

describe("perUnitMonthly", () => {
  it("multiplies a rate by a quantity in hundredths", () => {
    // 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75
    expect(perUnitMonthly(8550, 125_050)).toBe(10_691_775);
    // 1,000.33 sq ft × ₹99.99 = ₹1,00,022.9967 → ₹1,00,023.00
    expect(perUnitMonthly(9999, 100_033)).toBe(10_002_300);
  });
});

describe("sumPaise", () => {
  it("adds integer amounts", () => {
    expect(sumPaise([3_612_903, 4_606_452])).toBe(8_219_355);
    expect(sumPaise([])).toBe(0);
  });

  it("rejects a non-integer amount", () => {
    expect(() => sumPaise([1, 0.5])).toThrow(RangeError);
  });
});
