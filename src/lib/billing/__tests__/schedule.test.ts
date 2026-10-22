import { describe, expect, it } from "vitest";
import { rentSchedule } from "../schedule";
import type { Charge } from "../types";

const settings = { roundEscalatedRentToRupee: true };

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 10_000_000, // ₹1,00,000
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

describe("rentSchedule", () => {
  it("golden 1: 36 months at ₹1,00,000 / ₹1,05,000 / ₹1,10,250", () => {
    const schedule = rentSchedule(
      {
        id: "L-1",
        startDate: "2026-04-01",
        endDate: "2029-03-31",
        charges: [rent],
        escalationRules: [
          { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
        ],
      },
      settings,
    );
    const amounts = schedule.periods.map((p) => p.amount);
    expect(amounts).toHaveLength(36);
    expect(new Set(amounts.slice(0, 12))).toEqual(new Set([10_000_000]));
    expect(new Set(amounts.slice(12, 24))).toEqual(new Set([10_500_000]));
    expect(new Set(amounts.slice(24))).toEqual(new Set([11_025_000]));
    expect(schedule.periods[12]?.period).toEqual({
      start: "2027-04-01",
      end: "2027-04-30",
    });
  });

  it("golden 3: rent-free Jan–Mar 2027, CAM billed from January", () => {
    const schedule = rentSchedule(
      {
        id: "L-2",
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
      },
      settings,
    );
    expect(schedule.rentStartsOn).toBe("2027-04-01");
    // Jan–Mar: CAM ₹25,000 only; Apr: rent ₹2,00,000 + CAM ₹25,000
    expect(schedule.totalsByMonth.slice(0, 4)).toEqual([
      { month: "2027-01", total: 2_500_000 },
      { month: "2027-02", total: 2_500_000 },
      { month: "2027-03", total: 2_500_000 },
      { month: "2027-04", total: 22_500_000 },
    ]);
    const firstRent = schedule.periods.find((p) => p.chargeId === "rent");
    expect(firstRent?.period.start).toBe("2027-04-01");
  });

  it("pro-rates the first and last month", () => {
    const schedule = rentSchedule(
      {
        id: "L-3",
        startDate: "2024-11-21",
        endDate: "2026-11-20",
        charges: [{ ...rent, amountPaise: 9_000_000, startDate: "2024-11-21" }],
      },
      settings,
    );
    // Nov 2024: 21–30 Nov = 10 days → ₹90,000 × 10 / 30 = ₹30,000
    // Nov 2026: 1–20 Nov = 20 days → ₹90,000 × 20 / 30 = ₹60,000 (golden 11)
    expect(schedule.periods.at(0)?.amount).toBe(3_000_000);
    expect(schedule.periods.at(-1)?.amount).toBe(6_000_000);
    expect(schedule.periods).toHaveLength(25);
  });

  it("never starts or ends a period outside the lease or charge dates", () => {
    const schedule = rentSchedule(
      {
        id: "L-3",
        startDate: "2024-11-21",
        endDate: "2026-11-20",
        charges: [
          { ...rent, amountPaise: 9_000_000, startDate: "2024-11-21" },
          {
            ...rent,
            id: "cam",
            type: "cam",
            amountPaise: 3_000_000,
            startDate: "2025-02-10",
            frequency: "quarterly",
          },
        ],
      },
      settings,
    );
    const rentPeriods = schedule.periods.filter((p) => p.chargeId === "rent");
    const camPeriods = schedule.periods.filter((p) => p.chargeId === "cam");
    expect(rentPeriods.at(0)?.period).toEqual({
      start: "2024-11-21",
      end: "2024-11-30",
    });
    expect(rentPeriods.at(-1)?.period).toEqual({
      start: "2026-11-01",
      end: "2026-11-20",
    });
    // CAM starts 10 Feb 2025, inside the Jan–Mar quarter
    expect(camPeriods.at(0)?.period).toEqual({
      start: "2025-02-10",
      end: "2025-03-31",
    });
    expect(camPeriods.at(-1)?.period).toEqual({
      start: "2026-10-01",
      end: "2026-11-20",
    });
  });

  it("totals each month by what that month's run bills", () => {
    const cam: Charge = {
      ...rent,
      id: "cam",
      type: "cam",
      amountPaise: 3_000_000, // ₹30,000 per quarter
      startDate: "2026-05-15",
      frequency: "quarterly",
    };
    const lease = {
      id: "L-5",
      startDate: "2026-05-15",
      endDate: "2029-05-14",
      charges: [cam],
    };
    // In advance: 15 May–30 Jun (₹15,483.87) in the May run, Jul–Sep in July
    expect(rentSchedule(lease, settings).totalsByMonth.slice(0, 2)).toEqual([
      { month: "2026-05", total: 1_548_387 },
      { month: "2026-07", total: 3_000_000 },
    ]);
    // In arrears: 15 May–30 Jun in the July run, Jul–Sep in October
    const arrears = {
      ...lease,
      charges: [{ ...cam, timing: "arrears" as const }],
    };
    expect(rentSchedule(arrears, settings).totalsByMonth.slice(0, 2)).toEqual([
      { month: "2026-07", total: 1_548_387 },
      { month: "2026-10", total: 3_000_000 },
    ]);
  });

  it("bills quarterly charges by FY quarter, part quarters month by month", () => {
    const schedule = rentSchedule(
      {
        id: "L-4",
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
      },
      settings,
    );
    const periods = schedule.periods.map((p) => [p.period.start, p.amount]);
    // Month by month at ₹30,000 ÷ 3 = ₹10,000:
    // First: 15–31 May 2026 = 30,000 × 17 / 93 = 5,483.87, plus June 10,000
    //        → ₹15,483.87
    // Last: April 2029 10,000, plus 1–14 May = 30,000 × 14 / 93 = 4,516.13
    //       → ₹14,516.13
    expect(periods[0]).toEqual(["2026-05-15", 1_548_387]);
    expect(periods[1]).toEqual(["2026-07-01", 3_000_000]);
    expect(periods.at(-1)).toEqual(["2029-04-01", 1_451_613]);
    expect(periods).toHaveLength(13);
  });
});
