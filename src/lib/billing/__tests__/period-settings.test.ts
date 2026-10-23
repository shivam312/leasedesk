// billing.partPeriodMethod and billing.monthEndRule (docs/SETTINGS.md), every option.

import { describe, expect, it } from "vitest";
import { addMonths } from "../dates";
import { amountSteps } from "../escalation";
import { invoiceForRun } from "../invoice-lines";
import { rentCommencement } from "../rent-free";
import { rentSchedule, type LeaseInput } from "../schedule";
import type { Charge } from "../types";
import { DEFAULT_SETTINGS, withSettings } from "./billing-settings";

const quarterlyCam: Charge = {
  id: "cam",
  type: "cam",
  basis: "fixed",
  amountPaise: 3_000_000, // ₹30,000 a quarter
  startDate: "2026-05-15",
  frequency: "quarterly",
  gstRateBp: 1800,
  sacCode: "997212",
};

const camLease: LeaseInput = {
  id: "L-Q",
  startDate: "2026-05-15",
  endDate: "2029-05-14",
  charges: [quarterlyCam],
};

const firstQuarterAmount = (method: "month_by_month" | "days_in_period") =>
  invoiceForRun(camLease, "2026-05", withSettings({ partPeriodMethod: method }))
    ?.lines[0]?.taxablePaise;

describe("billing.partPeriodMethod (D-001)", () => {
  it("month_by_month (default): ₹30,000 a quarter from 15 May → ₹15,483.87", () => {
    // Monthly equivalent ₹10,000.
    // May: 15–31 May = 17 days: 30,000 × 17 ÷ (3 × 31) = 5,483.870… → ₹5,483.87
    // June: full month: ₹10,000.00
    // Total ₹15,483.87
    expect(firstQuarterAmount("month_by_month")).toBe(1_548_387);
  });

  it("days_in_period: ₹30,000 a quarter from 15 May → ₹15,494.51", () => {
    // Apr–Jun quarter = 30 + 31 + 30 = 91 days; 15 May–30 Jun = 47 days
    // 30,000 × 47 ÷ 91 = 15,494.505… → ₹15,494.51
    expect(firstQuarterAmount("days_in_period")).toBe(1_549_451);
  });

  it("days_in_period explains the calculation", () => {
    const line = invoiceForRun(
      camLease,
      "2026-05",
      withSettings({ partPeriodMethod: "days_in_period" }),
    )?.lines[0];
    expect(line?.explanation.steps.at(-1)).toContain("47 / 91 days");
  });

  it("days_in_period: a quarter split by an increase bills each part by days in the quarter", () => {
    // ₹30,000 a quarter from 1 Apr 2026, +10% every 12 months from 15 May 2026
    // (custom anchor), so the Apr–Jun 2027 quarter splits on 15 May 2027.
    // 1 Apr–14 May 2027 = 30 + 14 = 44 days at ₹30,000: 30,000 × 44 ÷ 91 = 14,505.494… → ₹14,505.49
    // 15 May–30 Jun 2027 = 17 + 30 = 47 days at ₹33,000: 33,000 × 47 ÷ 91 = 17,043.956… → ₹17,043.96
    const lease: LeaseInput = {
      id: "L-S",
      startDate: "2026-04-01",
      endDate: "2029-03-31",
      charges: [{ ...quarterlyCam, startDate: "2026-04-01" }],
      escalationRules: [
        {
          percentBp: 1000,
          everyMonths: 12,
          anchor: "custom",
          anchorDate: "2026-05-15",
          appliesTo: ["cam"],
        },
      ],
    };
    const lines = invoiceForRun(
      lease,
      "2027-04",
      withSettings({ partPeriodMethod: "days_in_period" }),
    )?.lines;
    expect(lines?.map((l) => l.taxablePaise)).toEqual([1_450_549, 1_704_396]);
  });

  it("days_in_period: a lease ending 20 Nov, quarterly in arrears, billed in the December run", () => {
    const lease: LeaseInput = {
      id: "L-E",
      startDate: "2026-04-01",
      endDate: "2026-11-20",
      charges: [
        { ...quarterlyCam, startDate: "2026-04-01", timing: "arrears" },
      ],
    };
    const amount = (partPeriodMethod: "month_by_month" | "days_in_period") =>
      invoiceForRun(lease, "2026-12", withSettings({ partPeriodMethod }))
        ?.lines[0]?.taxablePaise;
    // Oct–Dec = 31 + 30 + 31 = 92 days; 1 Oct–20 Nov = 31 + 20 = 51 days
    // 30,000 × 51 ÷ 92 = 16,630.434… → ₹16,630.43
    expect(amount("days_in_period")).toBe(1_663_043);
    // Month by month: Oct ₹10,000 + Nov 30,000 × 20 ÷ 90 = 6,666.666… → ₹6,666.67 = ₹16,666.67
    expect(amount("month_by_month")).toBe(1_666_667);
  });

  it("days_in_period: Jan–Mar 2028 has 91 days (leap year)", () => {
    const lease: LeaseInput = {
      ...camLease,
      startDate: "2028-02-15",
      endDate: "2031-02-14",
      charges: [{ ...quarterlyCam, startDate: "2028-02-15" }],
    };
    // 31 + 29 + 31 = 91 days; 15 Feb–31 Mar = 15 + 31 = 46 days
    // 30,000 × 46 ÷ 91 = 15,164.835… → ₹15,164.84
    expect(
      invoiceForRun(
        lease,
        "2028-02",
        withSettings({ partPeriodMethod: "days_in_period" }),
      )?.lines[0]?.taxablePaise,
    ).toBe(1_516_484);
  });

  it("doesn't change monthly charges: a part month is always by days in that month", () => {
    const monthly: LeaseInput = {
      ...camLease,
      charges: [
        { ...quarterlyCam, frequency: "monthly", amountPaise: 9_000_000 },
      ],
    };
    // ₹90,000 a month, 15–31 May = 17 of 31 days: 90,000 × 17 ÷ 31 = 49,354.838… → ₹49,354.84
    for (const partPeriodMethod of [
      "month_by_month",
      "days_in_period",
    ] as const)
      expect(
        invoiceForRun(monthly, "2026-05", withSettings({ partPeriodMethod }))
          ?.lines[0]?.taxablePaise,
      ).toBe(4_935_484);
  });
});

describe("billing.monthEndRule", () => {
  it("roll_forward (default): 31 Jan + 1 month → 1 Mar; last_day → 28 Feb", () => {
    expect(addMonths("2027-01-31", 1, "last_day")).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1, "last_day")).toBe("2028-02-29");
    // Days that exist are the same either way.
    expect(addMonths("2027-01-28", 1, "last_day")).toBe("2027-02-28");
  });

  it("last_day can count backwards too: 31 Mar − 1 month → 28 Feb", () => {
    expect(addMonths("2027-03-31", -1, "last_day")).toBe("2027-02-28");
  });

  const lease: LeaseInput = {
    id: "L-M",
    startDate: "2027-01-31",
    endDate: "2030-01-30",
    rentFreeMonths: 1,
    charges: [
      {
        id: "rent",
        type: "rent",
        basis: "fixed",
        amountPaise: 10_000_000, // ₹1,00,000
        startDate: "2027-01-31",
        gstRateBp: 1800,
        sacCode: "997212",
      },
    ],
  };

  it("rent commencement after 1 rent-free month from 31 Jan", () => {
    // roll_forward: no 31 Feb → 1 Mar. last_day: 28 Feb.
    expect(rentCommencement(lease, DEFAULT_SETTINGS).date).toBe("2027-03-01");
    expect(
      rentCommencement(lease, withSettings({ monthEndRule: "last_day" })).date,
    ).toBe("2027-02-28");
  });

  it("last_day bills 28 Feb: ₹1,00,000 × 1 / 28 days = ₹3,571.43", () => {
    const settings = withSettings({ monthEndRule: "last_day" });
    // 1,00,000 × 1 ÷ 28 = 3,571.428… → ₹3,571.43
    expect(
      invoiceForRun(lease, "2027-02", settings)?.lines.map(
        (l) => l.taxablePaise,
      ),
    ).toEqual([357_143]);
    expect(invoiceForRun(lease, "2027-02", DEFAULT_SETTINGS)).toBeNull();
    expect(rentSchedule(lease, settings).rentStartsOn).toBe("2027-02-28");
  });

  it("moves increase dates: 5% every 12 months from 29 Feb 2028", () => {
    const charge = { ...lease.charges[0]!, startDate: "2028-02-29" };
    const terms = { id: "L-L", startDate: "2028-02-29", endDate: "2031-02-28" };
    const rules = [
      { percentBp: 500, everyMonths: 12, anchor: "lease_start" as const },
    ];
    const dates = (monthEndRule: "roll_forward" | "last_day") =>
      amountSteps({
        charge,
        lease: terms,
        rules,
        settings: withSettings({ monthEndRule }),
      }).map((s) => s.from);
    expect(dates("roll_forward")).toEqual([
      "2028-02-29",
      "2029-03-01",
      "2030-03-01",
    ]);
    // last_day: 28 Feb 2029, 28 Feb 2030, and 28 Feb 2031, the lease's last
    // day, where an increase still applies (section 5). roll_forward's third
    // date, 1 Mar 2031, is after the lease ends.
    expect(dates("last_day")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
    ]);
  });

  it("moves increases anchored on rent commencement", () => {
    // Lease 31 Jan 2027, 1 rent-free month, 5% every 12 months from rent commencement.
    // roll_forward: rent starts 1 Mar 2027 → increase 1 Mar 2028.
    // last_day: rent starts 28 Feb 2027 → increase 28 Feb 2028.
    const dates = (monthEndRule: "roll_forward" | "last_day") =>
      amountSteps({
        charge: lease.charges[0]!,
        lease,
        rules: [
          { percentBp: 500, everyMonths: 12, anchor: "rent_commencement" },
        ],
        settings: withSettings({ monthEndRule }),
      })
        .slice(1, 2)
        .map((s) => s.from);
    expect(dates("roll_forward")).toEqual(["2028-03-01"]);
    expect(dates("last_day")).toEqual(["2028-02-28"]);
  });
});
