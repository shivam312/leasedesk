import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatFinancialYear,
  formatINR,
  formatMonth,
} from "../format";

describe("formatINR", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(100)).toBe("₹1");
    expect(formatINR(99_900)).toBe("₹999");
  });

  it("shows two decimals when there are paise", () => {
    expect(formatINR(1)).toBe("₹0.01");
    expect(formatINR(50)).toBe("₹0.50");
    expect(formatINR(1_18_000_50)).toBe("₹1,18,000.50");
    expect(formatINR(12_34_567_05)).toBe("₹12,34,567.05");
  });

  it("groups thousands, lakhs and crores the Indian way", () => {
    expect(formatINR(1_000_00)).toBe("₹1,000");
    expect(formatINR(99_999_00)).toBe("₹99,999");
    expect(formatINR(1_00_000_00)).toBe("₹1,00,000");
    expect(formatINR(1_18_000_00)).toBe("₹1,18,000");
    expect(formatINR(12_34_567_00)).toBe("₹12,34,567");
    expect(formatINR(1_00_00_000_00)).toBe("₹1,00,00,000");
    expect(formatINR(1_23_45_67_890_00)).toBe("₹1,23,45,67,890");
  });

  it("puts the minus sign before the rupee symbol", () => {
    expect(formatINR(-1_200_00)).toBe("-₹1,200");
    expect(formatINR(-1_18_000_50)).toBe("-₹1,18,000.50");
    expect(formatINR(-0)).toBe("₹0");
  });

  it("accepts bigint, including amounts above 2^53", () => {
    expect(formatINR(1_18_000_00n)).toBe("₹1,18,000");
    expect(formatINR(-5n)).toBe("-₹0.05");
    // 2^63 - 1 paise, the largest Postgres bigint
    expect(formatINR(9_223_372_036_854_775_807n)).toBe(
      "₹92,23,37,20,36,85,47,758.07",
    );
  });

  it("rejects fractional paise and unsafe numbers", () => {
    expect(() => formatINR(10.5)).toThrow(RangeError);
    expect(() => formatINR(Number.NaN)).toThrow(RangeError);
    expect(() => formatINR(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatINR(2 ** 53)).toThrow(RangeError);
  });
});

describe("formatDate", () => {
  it("formats a plain date as DD-MM-YYYY", () => {
    expect(formatDate("2026-10-22")).toBe("22-10-2026");
    expect(formatDate("2027-01-05")).toBe("05-01-2027");
  });

  it("accepts 29 February only in leap years", () => {
    expect(formatDate("2028-02-29")).toBe("29-02-2028");
    expect(formatDate("2000-02-29")).toBe("29-02-2000");
    expect(() => formatDate("2027-02-29")).toThrow(RangeError);
    expect(() => formatDate("2100-02-29")).toThrow(RangeError);
  });

  it("rejects anything that isn't a real YYYY-MM-DD date", () => {
    for (const bad of [
      "",
      "22-10-2026",
      "2026-10-22T00:00:00Z",
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "2026-10-00",
      "2026-1-5",
    ]) {
      expect(() => formatDate(bad), bad).toThrow(RangeError);
    }
  });
});

describe("formatMonth", () => {
  it("formats a date or a YYYY-MM month as 'Mon YYYY'", () => {
    expect(formatMonth("2026-10-22")).toBe("Oct 2026");
    expect(formatMonth("2027-01-01")).toBe("Jan 2027");
    expect(formatMonth("2026-12")).toBe("Dec 2026");
  });

  it("rejects invalid months", () => {
    expect(() => formatMonth("2026-13")).toThrow(RangeError);
    expect(() => formatMonth("Oct 2026")).toThrow(RangeError);
  });
});

describe("formatFinancialYear", () => {
  it("uses the April–March financial year", () => {
    expect(formatFinancialYear("2026-10-22")).toBe("FY 2026-27");
    expect(formatFinancialYear("2026-04-01")).toBe("FY 2026-27");
    expect(formatFinancialYear("2026-03-31")).toBe("FY 2025-26");
    expect(formatFinancialYear("2027-01-15")).toBe("FY 2026-27");
  });

  it("pads the end year across a century", () => {
    expect(formatFinancialYear("2099-12-31")).toBe("FY 2099-00");
    expect(formatFinancialYear("2009-06-01")).toBe("FY 2009-10");
  });

  it("rejects invalid dates", () => {
    expect(() => formatFinancialYear("2026-02-30")).toThrow(RangeError);
  });
});
