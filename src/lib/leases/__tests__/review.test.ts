import { describe, expect, it } from "vitest";
import { billingSettings } from "@/lib/settings/billing";
import { defaultSettings } from "@/lib/settings/schema";
import { chargeSummary, reviewRows } from "../review";

const settings = billingSettings(defaultSettings());

const charge = {
  timing: "advance" as const,
  gstRateBp: 1800,
  sacCode: "997212",
  startDate: "2026-04-01",
};

describe("reviewRows", () => {
  it("shows every month of the lease, with the rent increase marked", () => {
    // 1,000 sq ft × ₹100 = ₹1,00,000 a month for the first 12 months;
    // +5% from 01-04-2027: ₹1,00,000 × 1.05 = ₹1,05,000.
    // CAM 1,000 sq ft × ₹15 = ₹15,000 a month throughout.
    const rows = reviewRows(
      {
        id: "L1",
        startDate: "2026-04-01",
        endDate: "2028-03-31",
        charges: [
          {
            ...charge,
            id: "rent",
            type: "rent",
            basis: "per_sqft",
            ratePaise: 10000,
            areaHundredths: 100000,
          },
          {
            ...charge,
            id: "cam",
            type: "cam",
            basis: "per_sqft",
            ratePaise: 1500,
            areaHundredths: 100000,
          },
        ],
        escalationRules: [
          { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
        ],
      },
      settings,
    );
    expect(rows).toHaveLength(24);
    expect(rows[0]).toEqual({
      month: "2026-04",
      rent: 10000000,
      other: 1500000,
      total: 11500000,
      rentIncreased: false,
    });
    expect(rows[11]).toMatchObject({
      month: "2027-03",
      rent: 10000000,
      rentIncreased: false,
    });
    expect(rows[12]).toEqual({
      month: "2027-04",
      rent: 10500000,
      other: 1500000,
      total: 12000000,
      rentIncreased: true,
    });
    expect(rows[13]?.rentIncreased).toBe(false);
  });

  it("shows rent-free months as ₹0 rent and doesn't mark rent starting as an increase", () => {
    // 2 rent-free months: rent starts 01-06-2026. CAM isn't waived.
    const rows = reviewRows(
      {
        id: "L2",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        rentFreeMonths: 2,
        charges: [
          {
            ...charge,
            id: "rent",
            type: "rent",
            basis: "fixed",
            amountPaise: 5000000,
          },
          {
            ...charge,
            id: "cam",
            type: "cam",
            basis: "fixed",
            amountPaise: 500000,
          },
        ],
      },
      settings,
    );
    expect(rows.slice(0, 3)).toEqual([
      {
        month: "2026-04",
        rent: 0,
        other: 500000,
        total: 500000,
        rentIncreased: false,
      },
      {
        month: "2026-05",
        rent: 0,
        other: 500000,
        total: 500000,
        rentIncreased: false,
      },
      {
        month: "2026-06",
        rent: 5000000,
        other: 500000,
        total: 5500000,
        rentIncreased: false,
      },
    ]);
  });
});

describe("chargeSummary", () => {
  it("shows a per sq ft charge's monthly amount and how it's worked out", () => {
    // 1,412 sq ft × ₹85 = ₹1,20,020 a month.
    expect(
      chargeSummary({
        ...charge,
        id: "rent",
        type: "rent",
        basis: "per_sqft",
        ratePaise: 8500,
        areaHundredths: 141200,
      }),
    ).toEqual({
      amount: "₹1,20,020 a month",
      how: "1,412 sq ft × ₹85 = ₹1,20,020 per month",
    });
  });

  it("shows a quarterly per-slot charge per quarter", () => {
    // 4 slots × ₹3,000 = ₹12,000 a month; × 3 = ₹36,000 a quarter.
    const s = chargeSummary({
      ...charge,
      id: "p",
      type: "parking",
      basis: "per_slot",
      ratePaise: 300000,
      slots: 4,
      frequency: "quarterly",
    });
    expect(s.amount).toBe("₹36,000 a quarter");
    expect(s.how).toContain("₹36,000 per quarter");
  });

  it("needs no working for a fixed amount", () => {
    expect(
      chargeSummary({
        ...charge,
        id: "c",
        type: "cam",
        basis: "fixed",
        amountPaise: 1500000,
      }),
    ).toEqual({ amount: "₹15,000 a month", how: null });
  });
});
