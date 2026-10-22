import { describe, expect, it } from "vitest";
import { invoiceForRun } from "../invoice-lines";
import type { LeaseInput } from "../schedule";
import type { Charge } from "../types";

const settings = { roundEscalatedRentToRupee: true, dueDays: 7 };

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 9_000_000, // ₹90,000
  startDate: "2026-09-16",
  gstRateBp: 1800,
  sacCode: "997212",
};

const lease: LeaseInput = {
  id: "L-1",
  startDate: "2026-09-16",
  endDate: "2029-09-15",
  charges: [rent],
};

function lines(result: ReturnType<typeof invoiceForRun>) {
  return result?.lines.map((l) => [l.description, l.taxablePaise]) ?? null;
}

describe("monthly, in advance (default)", () => {
  it("bills the first part month in that month's run, dated the 1st", () => {
    const invoice = invoiceForRun(lease, "2026-09", settings);
    // ₹90,000 × 15 / 30 = ₹45,000; due 1 Sep + 7 days = 8 Sep
    expect(invoice?.invoiceDate).toBe("2026-09-01");
    expect(invoice?.dueDate).toBe("2026-09-08");
    expect(lines(invoice)).toEqual([
      ["Rent 16-09-2026 to 30-09-2026", 4_500_000],
    ]);
    expect(invoice?.lines[0]).toMatchObject({
      chargeId: "rent",
      periodStart: "2026-09-16",
      periodEnd: "2026-09-30",
      gstRateBp: 1800,
      sacCode: "997212",
    });
  });

  it("bills a full month as 'for <month>'", () => {
    expect(lines(invoiceForRun(lease, "2026-10", settings))).toEqual([
      ["Rent for Oct 2026", 9_000_000],
    ]);
  });

  it("has nothing to bill before the lease or after it ends", () => {
    expect(invoiceForRun(lease, "2026-08", settings)).toBeNull();
    expect(invoiceForRun(lease, "2029-10", settings)).toBeNull();
  });

  it("golden 5: a mid-month increase gives two labelled lines", () => {
    const invoice = invoiceForRun(
      {
        id: "L-5",
        startDate: "2025-03-15",
        endDate: "2028-03-14",
        charges: [{ ...rent, amountPaise: 8_000_000, startDate: "2025-03-15" }],
        escalationRules: [
          { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
        ],
      },
      "2026-03",
      settings,
    );
    // 14 × 80,000 / 31 = ₹36,129.03; 17 × 84,000 / 31 = ₹46,064.52
    expect(lines(invoice)).toEqual([
      ["Rent 01-03-2026 to 14-03-2026", 3_612_903],
      ["Rent 15-03-2026 to 31-03-2026", 4_606_452],
    ]);
  });

  it("golden 3: only CAM during rent-free months, both from April", () => {
    const rentFree: LeaseInput = {
      id: "L-3",
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
    expect(lines(invoiceForRun(rentFree, "2027-03", settings))).toEqual([
      ["Maintenance (CAM) for Mar 2027", 2_500_000],
    ]);
    expect(lines(invoiceForRun(rentFree, "2027-04", settings))).toEqual([
      ["Rent for Apr 2027", 20_000_000],
      ["Maintenance (CAM) for Apr 2027", 2_500_000],
    ]);
  });
});

describe("in arrears", () => {
  const arrears: LeaseInput = {
    ...lease,
    charges: [{ ...rent, timing: "arrears" }],
  };

  it("bills a month in the next month's run", () => {
    expect(invoiceForRun(arrears, "2026-09", settings)).toBeNull();
    expect(lines(invoiceForRun(arrears, "2026-10", settings))).toEqual([
      ["Rent 16-09-2026 to 30-09-2026", 4_500_000],
    ]);
  });

  it("bills the last part month after the lease ends", () => {
    // 1–15 Sep 2029 = 15 days → ₹45,000, in the October 2029 run
    expect(lines(invoiceForRun(arrears, "2029-10", settings))).toEqual([
      ["Rent 01-09-2029 to 15-09-2029", 4_500_000],
    ]);
  });
});

describe("quarterly", () => {
  const cam: Charge = {
    ...rent,
    id: "cam",
    type: "cam",
    amountPaise: 3_000_000, // ₹30,000 per quarter
    startDate: "2026-05-15",
    frequency: "quarterly",
  };
  const quarterly: LeaseInput = {
    id: "L-10",
    startDate: "2026-05-15",
    endDate: "2029-05-14",
    charges: [cam],
  };

  it("golden 10: first bill pro-rated for 15 May–30 Jun, in the May run", () => {
    expect(invoiceForRun(quarterly, "2026-04", settings)).toBeNull();
    // Month by month: May ₹30,000 × 17 / (3 × 31) = ₹5,483.87; June ₹10,000
    expect(lines(invoiceForRun(quarterly, "2026-05", settings))).toEqual([
      ["Maintenance (CAM) 15-05-2026 to 30-06-2026", 1_548_387],
    ]);
    expect(invoiceForRun(quarterly, "2026-06", settings)).toBeNull();
  });

  it("bills full quarters in the quarter's first month", () => {
    expect(lines(invoiceForRun(quarterly, "2026-07", settings))).toEqual([
      ["Maintenance (CAM) for Jul–Sep 2026", 3_000_000],
    ]);
    expect(lines(invoiceForRun(quarterly, "2027-01", settings))).toEqual([
      ["Maintenance (CAM) for Jan–Mar 2027", 3_000_000],
    ]);
  });

  it("in arrears, bills a quarter in the month after it ends", () => {
    const arrears = {
      ...quarterly,
      charges: [{ ...cam, timing: "arrears" as const }],
    };
    expect(invoiceForRun(arrears, "2026-05", settings)).toBeNull();
    expect(lines(invoiceForRun(arrears, "2026-07", settings))).toEqual([
      ["Maintenance (CAM) 15-05-2026 to 30-06-2026", 1_548_387],
    ]);
  });
});

describe("quarterly in arrears, lease ending mid-quarter", () => {
  const ending: LeaseInput = {
    id: "L-11",
    startDate: "2024-11-21",
    endDate: "2026-11-20",
    charges: [
      {
        ...rent,
        id: "cam",
        type: "cam",
        amountPaise: 3_000_000, // ₹30,000 per quarter
        startDate: "2024-11-21",
        frequency: "quarterly",
        timing: "arrears",
      },
    ],
  };

  it("bills the final part quarter in the first run after the lease ends", () => {
    // Oct full: 30,000 ÷ 3 = 10,000.00
    // 1–20 Nov: 30,000 × 20 / (3 × 30) = 6,666.67 → total ₹16,666.67
    // Lease ends 20 Nov → December run, not January (after the quarter)
    expect(invoiceForRun(ending, "2026-11", settings)).toBeNull();
    expect(lines(invoiceForRun(ending, "2026-12", settings))).toEqual([
      ["Maintenance (CAM) 01-10-2026 to 20-11-2026", 1_666_667],
    ]);
    expect(invoiceForRun(ending, "2027-01", settings)).toBeNull();
  });

  it("still bills earlier quarters in the month after they end", () => {
    expect(lines(invoiceForRun(ending, "2026-10", settings))).toEqual([
      ["Maintenance (CAM) for Jul–Sep 2026", 3_000_000],
    ]);
  });
});

describe("settings", () => {
  it("needs whole due days", () => {
    expect(() =>
      invoiceForRun(lease, "2026-10", { ...settings, dueDays: -1 }),
    ).toThrow(RangeError);
  });
});
