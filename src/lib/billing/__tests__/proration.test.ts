import { describe, expect, it } from "vitest";
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

  it("golden 10: quarterly ₹30,000 from 15 May is pro-rated over the quarter's days", () => {
    const segments = segmentsForPeriod({
      steps: [step("2026-05-15", 3_000_000)],
      window: { from: "2026-05-15", to: "2029-05-14" },
      period: { start: "2026-04-01", end: "2026-06-30" },
    });
    // 15 May–30 Jun = 17 + 30 = 47 days; Apr–Jun = 30 + 31 + 30 = 91 days.
    // ₹30,000 × 47 / 91 = ₹15,494.505 → ₹15,494.51 (open question 5)
    expect(summary(segments)).toEqual([
      {
        from: "2026-05-15",
        to: "2026-06-30",
        days: 47,
        periodDays: 91,
        amount: 1_549_451,
      },
    ]);
    expect(segments[0]?.explanation.steps.at(-1)).toBe(
      "15-05-2026 to 30-06-2026: ₹30,000 × 47 / 91 days = ₹15,494.51",
    );
  });

  it("is empty when the period is outside the billing window", () => {
    expect(
      segmentsForPeriod({
        steps: [step("2027-04-01", 20_000_000)],
        window: { from: "2027-04-01", to: "2029-12-31" },
        period: { start: "2027-03-01", end: "2027-03-31" },
      }),
    ).toEqual([]);
  });

  it("refuses a window that starts before the first amount", () => {
    expect(() =>
      segmentsForPeriod({
        steps: [step("2026-09-16", 9_000_000)],
        window: { from: "2026-09-01", to: "2027-09-15" },
        period: september,
      }),
    ).toThrow(/no amount/);
  });
});
