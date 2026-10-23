import { describe, expect, it } from "vitest";
import { withBuildingDefaults } from "@/lib/settings/charge-defaults";
import { defaultSettings } from "@/lib/settings/schema";
import {
  chargeRowSchema,
  escalationRuleSchema,
  toChargeDraft,
} from "../charges-form";

const lease = {
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  // 1,250.50 sq ft
  areaHundredths: 125050,
};

const row = (extra: Record<string, unknown> = {}) => ({
  type: "rent",
  basis: "per_sqft",
  amount: "85.50",
  slots: "",
  startDate: "",
  endDate: "",
  gstRate: "",
  sacCode: "",
  label: "",
  ...extra,
});

describe("charge rows", () => {
  it("refuses a charge that ends before it starts", () => {
    // Starts 01-07-2026, ends 30-06-2026: no day to bill, and the database
    // check lease_charges_end_after_start would refuse the row.
    const result = chargeRowSchema.safeParse(
      row({ startDate: "2026-07-01", endDate: "2026-06-30" }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["endDate"],
      message: "A charge can't end before it starts.",
    });
    // A one-day charge (start = end) is fine.
    expect(
      chargeRowSchema.safeParse(
        row({ startDate: "2026-07-01", endDate: "2026-07-01" }),
      ).success,
    ).toBe(true);
  });

  it("reads rupees with Indian commas as paise", () => {
    // ₹1,25,000.50 = 1,25,00,050 paise
    expect(
      chargeRowSchema.parse(row({ basis: "fixed", amount: "1,25,000.50" }))
        .amount,
    ).toBe(12500050);
  });

  it("turns a per-sq-ft rent row into an engine charge with building defaults", () => {
    const draft = toChargeDraft(chargeRowSchema.parse(row()), "c1", lease);
    expect(withBuildingDefaults(draft, defaultSettings())).toEqual({
      id: "c1",
      type: "rent",
      basis: "per_sqft",
      // ₹85.50 per sq ft per month
      ratePaise: 8550,
      areaHundredths: 125050,
      startDate: "2026-04-01",
      frequency: "monthly",
      timing: "advance",
      gstRateBp: 1800,
      sacCode: "997212",
      waivedDuringRentFree: true,
    });
  });

  it("keeps a 0% GST rate the user typed instead of the building's 18%", () => {
    const draft = toChargeDraft(
      chargeRowSchema.parse(row({ type: "utilities", gstRate: "0" })),
      "c2",
      lease,
    );
    const saved = withBuildingDefaults(draft, defaultSettings());
    expect(saved.gstRateBp).toBe(0);
    expect(saved.waivedDuringRentFree).toBe(false);
  });

  it("needs a slot count for parking per slot", () => {
    expect(
      chargeRowSchema.safeParse(row({ type: "parking", basis: "per_slot" }))
        .success,
    ).toBe(false);
    const parsed = chargeRowSchema.parse(
      row({ type: "parking", basis: "per_slot", amount: "3,000", slots: "2" }),
    );
    expect(toChargeDraft(parsed, "c3", lease)).toMatchObject({
      basis: "per_slot",
      ratePaise: 300000,
      slots: 2,
    });
  });

  it("refuses a bad amount, GST rate or SAC code", () => {
    expect(chargeRowSchema.safeParse(row({ amount: "85.505" })).success).toBe(
      false,
    );
    expect(chargeRowSchema.safeParse(row({ gstRate: "101" })).success).toBe(
      false,
    );
    expect(chargeRowSchema.safeParse(row({ sacCode: "9972" })).success).toBe(
      false,
    );
  });
});

describe("rent-increase rules", () => {
  it("reads 5% every 12 months, compounding, from the lease start", () => {
    expect(
      escalationRuleSchema.parse({ percent: "5", everyMonths: "12" }),
    ).toEqual({
      percentBp: 500,
      everyMonths: 12,
      anchor: "lease_start",
      compounding: true,
    });
  });

  it("needs a date for a custom anchor", () => {
    expect(
      escalationRuleSchema.safeParse({
        percent: "15",
        everyMonths: "36",
        anchor: "custom",
        anchorDate: "",
      }).success,
    ).toBe(false);
    expect(
      escalationRuleSchema.parse({
        percent: "15",
        everyMonths: "36",
        anchor: "custom",
        anchorDate: "2026-07-01",
      }),
    ).toMatchObject({ anchor: "custom", anchorDate: "2026-07-01" });
  });

  it("refuses a 0% increase and a zero-month interval", () => {
    expect(
      escalationRuleSchema.safeParse({ percent: "0", everyMonths: "12" })
        .success,
    ).toBe(false);
    expect(
      escalationRuleSchema.safeParse({ percent: "5", everyMonths: "0" })
        .success,
    ).toBe(false);
  });
});
