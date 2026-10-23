import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./billing-settings";
import { segmentsForPeriod } from "../proration";
import type { AmountStep } from "../types";

function step(from: string, amount: number): AmountStep {
  return {
    from,
    amount,
    explanation: { rule: "Fixed amount", steps: [], result: amount },
  };
}

function summary(segments: ReturnType<typeof segmentsForPeriod>) {
  return segments.map(({ from, to, days, periodDays, amount }) => ({
    from,
    to,
    days,
    periodDays,
    amount,
  }));
}

const september = { start: "2026-09-01", end: "2026-09-30" };

describe("segmentsForPeriod", () => {
  it("bills a full month at the monthly amount, without rounding", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2026-04-01", 10_691_775)],
      window: { from: "2026-04-01", to: "2029-03-31" },
      period: september,
    });
    expect(summary(segments)).toEqual([
      {
        from: "2026-09-01",
        to: "2026-09-30",
        days: 30,
        periodDays: 30,
        amount: 10_691_775,
      },
    ]);
    expect(segments[0]?.explanation.steps.at(-1)).toBe(
      "Full month: ₹1,06,917.75",
    );
  });

  it("golden 4: rent starting 16 Sep is pro-rated 15/30", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2026-09-16", 9_000_000)],
      window: { from: "2026-09-16", to: "2029-09-15" },
      period: september,
    });
    // ₹90,000 × 15 / 30 = ₹45,000
    expect(summary(segments)).toEqual([
      {
        from: "2026-09-16",
        to: "2026-09-30",
        days: 15,
        periodDays: 30,
        amount: 4_500_000,
      },
    ]);
    expect(segments[0]?.explanation.steps.at(-1)).toBe(
      "16-09-2026 to 30-09-2026: ₹90,000 × 15 / 30 days = ₹45,000",
    );
  });

  it("golden 5: an increase on 15 Mar splits March into 14 + 17 days", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2025-03-15", 8_000_000), step("2026-03-15", 8_400_000)],
      window: { from: "2025-03-15", to: "2028-03-14" },
      period: { start: "2026-03-01", end: "2026-03-31" },
    });
    // 1–14 Mar: ₹80,000 × 14 / 31 = ₹36,129.032 → ₹36,129.03
    // 15–31 Mar: ₹84,000 × 17 / 31 = ₹46,064.516 → ₹46,064.52
    // Total ₹82,193.55
    expect(summary(segments)).toEqual([
      {
        from: "2026-03-01",
        to: "2026-03-14",
        days: 14,
        periodDays: 31,
        amount: 3_612_903,
      },
      {
        from: "2026-03-15",
        to: "2026-03-31",
        days: 17,
        periodDays: 31,
        amount: 4_606_452,
      },
    ]);
  });

  it("an increase on the 1st doesn't split the month", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2026-04-01", 10_000_000), step("2027-04-01", 10_500_000)],
      window: { from: "2026-04-01", to: "2029-03-31" },
      period: { start: "2027-04-01", end: "2027-04-30" },
    });
    expect(summary(segments)).toEqual([
      {
        from: "2027-04-01",
        to: "2027-04-30",
        days: 30,
        periodDays: 30,
        amount: 10_500_000,
      },
    ]);
  });

  it("golden 11: a lease ending 20 Nov bills 20 days of November", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2024-11-21", 9_000_000)],
      window: { from: "2024-11-21", to: "2026-11-20" },
      period: { start: "2026-11-01", end: "2026-11-30" },
    });
    // ₹90,000 × 20 / 30 = ₹60,000
    expect(summary(segments)).toEqual([
      {
        from: "2026-11-01",
        to: "2026-11-20",
        days: 20,
        periodDays: 30,
        amount: 6_000_000,
      },
    ]);
  });

  it("uses 29 days for February in a leap year", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2028-02-15", 8_700_000)],
      window: { from: "2028-02-15", to: "2031-02-14" },
      period: { start: "2028-02-01", end: "2028-02-29" },
    });
    // ₹87,000 × 15 / 29 = ₹45,000
    expect(summary(segments)[0]).toMatchObject({
      days: 15,
      periodDays: 29,
      amount: 4_500_000,
    });
  });

  it("golden 10: quarterly ₹30,000 from 15 May is billed month by month", () => {
    const segments = segmentsForPeriod({
      settings: DEFAULT_SETTINGS,
      steps: [step("2026-05-15", 3_000_000)],
      window: { from: "2026-05-15", to: "2029-05-14" },
      period: { start: "2026-04-01", end: "2026-06-30" },
    });
    // 15–31 May = 17 of 31 days: 30,000 × 17 / (3 × 31) = 5,483.870… → 5,483.87
    // June, full: 30,000 ÷ 3 = 10,000.00. Total 15,483.87
    expect(summary(segments)).toEqual([
      {
        from: "2026-05-15",
        to: "2026-06-30",
        days: 47,
        periodDays: 91,
        amount: 1_548_387,
      },
    ]);
    expect(segments[0]?.explanation.steps).toEqual([
      "15-05-2026 to 31-05-2026: ₹30,000 ÷ 3 × 17 / 31 days = ₹5,483.87",
      "Jun 2026: ₹30,000 ÷ 3 = ₹10,000",
      "15-05-2026 to 30-06-2026: ₹5,483.87 + ₹10,000 = ₹15,483.87",
    ]);
  });

  it("is empty when the period is outside the billing window", () => {
    expect(
      segmentsForPeriod({
        settings: DEFAULT_SETTINGS,
        steps: [step("2027-04-01", 20_000_000)],
        window: { from: "2027-04-01", to: "2029-12-31" },
        period: { start: "2027-03-01", end: "2027-03-31" },
      }),
    ).toEqual([]);
  });

  it("refuses a window that starts before the first amount", () => {
    expect(() =>
      segmentsForPeriod({
        settings: DEFAULT_SETTINGS,
        steps: [step("2026-09-16", 9_000_000)],
        window: { from: "2026-09-01", to: "2027-09-15" },
        period: september,
      }),
    ).toThrow(/no amount/);
  });

  describe("part quarters, month by month", () => {
    const octDec = { start: "2026-10-01", end: "2026-12-31" };

    it("bills a full quarter at the quarterly amount", () => {
      const segments = segmentsForPeriod({
        settings: DEFAULT_SETTINGS,
        steps: [step("2026-04-01", 3_000_000)],
        window: { from: "2026-04-01", to: "2029-03-31" },
        period: octDec,
      });
      expect(summary(segments)).toEqual([
        {
          from: "2026-10-01",
          to: "2026-12-31",
          days: 92,
          periodDays: 92,
          amount: 3_000_000,
        },
      ]);
    });

    it("lease ending 20 Nov: October whole, November by days in November", () => {
      const segments = segmentsForPeriod({
        settings: DEFAULT_SETTINGS,
        steps: [step("2026-04-01", 3_000_000)],
        window: { from: "2026-04-01", to: "2026-11-20" },
        period: octDec,
      });
      // ₹30,000 ÷ 3 = ₹10,000 a month
      // October (full): ₹10,000.00
      // 1–20 Nov: 30,000 × 20 / (3 × 30) = 6,666.666… → ₹6,666.67
      // Total ₹16,666.67
      expect(summary(segments)).toEqual([
        {
          from: "2026-10-01",
          to: "2026-11-20",
          days: 51,
          periodDays: 92,
          amount: 1_666_667,
        },
      ]);
      expect(segments[0]?.explanation.steps).toEqual([
        "Oct 2026: ₹30,000 ÷ 3 = ₹10,000",
        "01-11-2026 to 20-11-2026: ₹30,000 ÷ 3 × 20 / 30 days = ₹6,666.67",
        "01-10-2026 to 20-11-2026: ₹10,000 + ₹6,666.67 = ₹16,666.67",
      ]);
    });

    it("an increase mid-quarter splits it, each part month by month", () => {
      const segments = segmentsForPeriod({
        settings: DEFAULT_SETTINGS,
        steps: [step("2026-04-01", 3_000_000), step("2026-11-15", 3_150_000)],
        window: { from: "2026-04-01", to: "2029-03-31" },
        period: octDec,
      });
      // At ₹30,000: Oct full = 10,000.00; 1–14 Nov = 30,000 × 14 / 90 = 4,666.67
      //   → 14,666.67
      // At ₹31,500: 15–30 Nov = 31,500 × 16 / 90 = 5,600.00; Dec full = 10,500.00
      //   → 16,100.00
      expect(summary(segments).map((s) => [s.from, s.to, s.amount])).toEqual([
        ["2026-10-01", "2026-11-14", 1_466_667],
        ["2026-11-15", "2026-12-31", 1_610_000],
      ]);
    });
  });
});
