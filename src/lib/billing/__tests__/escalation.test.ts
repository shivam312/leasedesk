import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, withSettings } from "./billing-settings";
import { amountSteps } from "../escalation";
import type { Charge, EscalationRule, LeaseTerms } from "../types";

const lease: LeaseTerms = {
  id: "L-104",
  startDate: "2026-04-01",
  endDate: "2031-03-31",
};

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 10_000_000, // ₹1,00,000
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

const fivePercentYearly: EscalationRule = {
  percentBp: 500,
  everyMonths: 12,
  anchor: "lease_start",
};

const rounding = { settings: DEFAULT_SETTINGS };

function amounts(steps: { from: string; amount: number }[]) {
  return steps.map(({ from, amount }) => [from, amount]);
}

describe("compounding", () => {
  it("golden 1: ₹1,00,000, 5% every 12 months, 3-year lease", () => {
    const steps = amountSteps({
      charge: rent,
      lease: { ...lease, endDate: "2029-03-31" },
      rules: [fivePercentYearly],
      ...rounding,
    });
    // 1,00,000 → × 1.05 = 1,05,000 → × 1.05 = 1,10,250.
    // 1 Apr 2029 is not before the lease end (31 Mar 2029), so no 4th step.
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
      ["2028-04-01", 11_025_000],
    ]);
  });

  it("rounds each year to the rupee and compounds on the rounded figure", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      rules: [fivePercentYearly],
      ...rounding,
    });
    // Year 4: 1,10,250 × 1.05 = 1,15,762.50 → ₹1,15,763
    // Year 5: 1,15,763 × 1.05 = 1,21,551.15 → ₹1,21,551
    expect(amounts(steps).slice(3)).toEqual([
      ["2029-04-01", 11_576_300],
      ["2030-04-01", 12_155_100],
    ]);
    expect(steps[3]?.explanation.steps).toEqual([
      "Rent goes up 5% every 12 months from 01-04-2026",
      "Rent increase on 01-04-2029: ₹1,10,250 + 5%, to the nearest rupee = ₹1,15,763",
    ]);
  });

  it("rounds once per step, straight to the rupee", () => {
    const steps = amountSteps({
      charge: { ...rent, amountPaise: 9_001_571 }, // ₹90,015.71
      lease,
      rules: [fivePercentYearly],
      ...rounding,
    });
    // 90,015.71 × 1.05 = 94,516.4955 → ₹94,516
    // (rounding to the paisa first gives 94,516.50 → ₹94,517, which is wrong)
    expect(amounts(steps)[1]).toEqual(["2027-04-01", 9_451_600]);
  });

  it("keeps paise when rupee rounding is off", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      rules: [fivePercentYearly],
      settings: withSettings({ roundIncreasedRent: "none" }),
    });
    // Year 4: 1,10,250 × 1.05 = ₹1,15,762.50
    // Year 5: 1,15,762.50 × 1.05 = 1,21,550.625 → ₹1,21,550.63
    expect(amounts(steps).slice(3)).toEqual([
      ["2029-04-01", 11_576_250],
      ["2030-04-01", 12_155_063],
    ]);
  });
});

describe("non-compounding", () => {
  it("golden 6: 15% every 36 months on the base amount", () => {
    const steps = amountSteps({
      charge: rent,
      lease: { ...lease, endDate: "2035-03-31" },
      rules: [
        {
          percentBp: 1500,
          everyMonths: 36,
          anchor: "lease_start",
          compounding: false,
        },
      ],
      ...rounding,
    });
    // Years 4–6: 1,00,000 × (1 + 1 × 15%) = ₹1,15,000
    // Years 7–9: 1,00,000 × (1 + 2 × 15%) = ₹1,30,000
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2029-04-01", 11_500_000],
      ["2032-04-01", 13_000_000],
    ]);
  });
});

describe("anchors", () => {
  it("counts from rent commencement", () => {
    const steps = amountSteps({
      charge: { ...rent, startDate: "2027-01-01" },
      lease: {
        ...lease,
        startDate: "2027-01-01",
        endDate: "2029-12-31",
        rentFreeMonths: 3,
      },
      rules: [{ ...fivePercentYearly, anchor: "rent_commencement" }],
      ...rounding,
    });
    // Rent starts 1 Apr 2027, so increases on 1 Apr 2028 and 1 Apr 2029
    expect(amounts(steps)).toEqual([
      ["2027-01-01", 10_000_000],
      ["2028-04-01", 10_500_000],
      ["2029-04-01", 11_025_000],
    ]);
  });

  it("counts from a custom date, including mid-month", () => {
    const steps = amountSteps({
      charge: { ...rent, amountPaise: 8_000_000, startDate: "2025-01-01" },
      lease: { ...lease, startDate: "2025-01-01", endDate: "2026-12-31" },
      rules: [
        { ...fivePercentYearly, anchor: "custom", anchorDate: "2025-03-15" },
      ],
      ...rounding,
    });
    // ₹80,000 × 1.05 = ₹84,000 from 15 Mar 2026 (golden 5's new rent);
    // 15 Mar 2027 is after the lease end
    expect(amounts(steps)).toEqual([
      ["2025-01-01", 8_000_000],
      ["2026-03-15", 8_400_000],
    ]);
  });

  it("needs an anchor date for a custom anchor", () => {
    expect(() =>
      amountSteps({
        charge: rent,
        lease,
        rules: [{ ...fivePercentYearly, anchor: "custom" }],
        ...rounding,
      }),
    ).toThrow(/anchor date/);
  });
});

describe("which charges", () => {
  const cam: Charge = {
    ...rent,
    id: "cam",
    type: "cam",
    amountPaise: 1_234_567, // ₹12,345.67
  };

  it("applies to rent only by default", () => {
    const steps = amountSteps({
      charge: cam,
      lease,
      rules: [fivePercentYearly],
      ...rounding,
    });
    expect(amounts(steps)).toEqual([["2026-04-01", 1_234_567]]);
  });

  it("applies to listed charges, rounding non-rent to the paisa", () => {
    const steps = amountSteps({
      charge: cam,
      lease: { ...lease, endDate: "2028-03-31" },
      rules: [{ ...fivePercentYearly, appliesTo: ["cam"] }],
      ...rounding,
    });
    // 12,345.67 × 1.05 = 12,962.9535 → ₹12,962.95 (not a rent line, so not
    // rounded to the rupee)
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 1_234_567],
      ["2027-04-01", 1_296_295],
    ]);
  });

  it("refuses two rules on the same charge", () => {
    expect(() =>
      amountSteps({
        charge: rent,
        lease,
        rules: [fivePercentYearly, { ...fivePercentYearly, percentBp: 300 }],
        ...rounding,
      }),
    ).toThrow(/L-104/);
  });

  it("only applies increases after the charge starts and before it ends", () => {
    const steps = amountSteps({
      charge: { ...rent, endDate: "2028-01-31" },
      lease,
      rules: [fivePercentYearly],
      ...rounding,
    });
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
    ]);
  });

  it("applies an increase dated on the lease's last day", () => {
    const steps = amountSteps({
      charge: rent,
      lease: { ...lease, endDate: "2027-04-01" },
      rules: [fivePercentYearly],
      ...rounding,
    });
    // 1 Apr 2026 + 12 months = 1 Apr 2027 = lease end → applies (on or before)
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
    ]);
  });

  it("applies an increase dated on the charge's last day, the same rule", () => {
    const steps = amountSteps({
      charge: { ...rent, endDate: "2027-04-01" },
      lease,
      rules: [fivePercentYearly],
      ...rounding,
    });
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
    ]);
  });

  it("ignores an increase dated the day after the lease ends", () => {
    const steps = amountSteps({
      charge: rent,
      lease: { ...lease, endDate: "2027-03-31" },
      rules: [fivePercentYearly],
      ...rounding,
    });
    expect(amounts(steps)).toEqual([["2026-04-01", 10_000_000]]);
  });
});

describe("custom escalations", () => {
  it("a new amount replaces the rule from its date", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      rules: [fivePercentYearly],
      custom: [
        {
          chargeId: "rent",
          effectiveDate: "2028-04-01",
          newAmountPaise: 12_000_000,
        },
      ],
      ...rounding,
    });
    // Rule until then (1,05,000 in 2027), then ₹1,20,000 from 1 Apr 2028.
    // Rule increases from that date on are dropped (section 5).
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
      ["2028-04-01", 12_000_000],
    ]);
  });

  it("a percentage applies to the amount before it", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      rules: [fivePercentYearly],
      custom: [
        { chargeId: "rent", effectiveDate: "2028-04-01", percentBp: 1000 },
        { chargeId: "rent", effectiveDate: "2030-04-01", percentBp: 750 },
      ],
      ...rounding,
    });
    // 1,05,000 × 1.10 = 1,15,500; 1,15,500 × 1.075 = 1,24,162.50 → ₹1,24,163
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
      ["2028-04-01", 11_550_000],
      ["2030-04-01", 12_416_300],
    ]);
  });

  it("a negative percentage is explained as a decrease", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      rules: [fivePercentYearly],
      custom: [
        { chargeId: "rent", effectiveDate: "2028-04-01", percentBp: -1000 },
      ],
      ...rounding,
    });
    // 1,05,000 × 0.90 = 94,500
    expect(amounts(steps)[2]).toEqual(["2028-04-01", 9_450_000]);
    expect(steps[2]?.explanation).toEqual({
      rule: "Rent decrease",
      steps: [
        "Rent decrease on 01-04-2028: ₹1,05,000 − 10%, to the nearest rupee = ₹94,500",
      ],
      result: 9_450_000,
    });
  });

  it("a lower agreed amount is a decrease", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      custom: [
        {
          chargeId: "rent",
          effectiveDate: "2028-04-01",
          newAmountPaise: 9_000_000,
        },
      ],
      ...rounding,
    });
    expect(steps[1]?.explanation).toEqual({
      rule: "Rent decrease",
      steps: ["Rent decreases on 01-04-2028 to the agreed ₹90,000"],
      result: 9_000_000,
    });
  });

  it("works without a rule, and ignores other charges' entries", () => {
    const steps = amountSteps({
      charge: rent,
      lease,
      custom: [
        {
          chargeId: "rent",
          effectiveDate: "2027-10-15",
          newAmountPaise: 11_000_000,
        },
        { chargeId: "cam", effectiveDate: "2027-04-01", newAmountPaise: 1 },
      ],
      ...rounding,
    });
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-10-15", 11_000_000],
    ]);
  });

  it("needs exactly one of new amount or percentage, after the charge starts", () => {
    const bad = [
      { chargeId: "rent", effectiveDate: "2028-04-01" },
      {
        chargeId: "rent",
        effectiveDate: "2028-04-01",
        newAmountPaise: 1,
        percentBp: 1,
      },
      { chargeId: "rent", effectiveDate: "2026-04-01", newAmountPaise: 1 },
    ];
    for (const entry of bad) {
      expect(() =>
        amountSteps({ charge: rent, lease, custom: [entry], ...rounding }),
      ).toThrow(/L-104/);
    }
  });

  it("refuses two custom increases for one charge on the same date, in either order", () => {
    // ₹1,00,000 with +5% and +10% both on 1 Apr 2028 is ambiguous:
    // 1,00,000 × 1.05 × 1.10 = ₹1,15,500, but read as one change it could be
    // ₹1,10,000 or ₹1,05,000. The input order must not decide the rent.
    const five = {
      chargeId: "rent",
      effectiveDate: "2028-04-01",
      percentBp: 500,
    };
    const ten = { ...five, percentBp: 1000 };
    // Agreed ₹1,20,000 and +5% on one date: ₹1,20,000 × 1.05 = ₹1,26,000 in
    // one order, ₹1,20,000 in the other.
    const agreed = {
      chargeId: "rent",
      effectiveDate: "2028-04-01",
      newAmountPaise: 12_000_000,
    };
    for (const custom of [
      [five, ten],
      [ten, five],
      [agreed, five],
      [five, agreed],
    ]) {
      expect(() =>
        amountSteps({ charge: rent, lease, custom, ...rounding }),
      ).toThrow(/L-104.*more than one custom rent increase on 2028-04-01/);
    }
    // Same date on a different charge is fine.
    const steps = amountSteps({
      charge: rent,
      lease,
      custom: [five, { ...ten, chargeId: "cam" }],
      ...rounding,
    });
    // 1,00,000 × 1.05 = ₹1,05,000
    expect(amounts(steps)).toEqual([
      ["2026-04-01", 10_000_000],
      ["2028-04-01", 10_500_000],
    ]);
  });
});

describe("inconsistent dates", () => {
  it("stops when a charge starts after the lease ends (Codex M1 should-fix)", () => {
    // Rule dates 1 Apr 2027, 2028 … grow every step, so the loop stops at the
    // first one after the lease end (31 Mar 2031); none is after the charge
    // start (1 Apr 2032), so only the starting ₹1,00,000 is left.
    const steps = amountSteps({
      charge: { ...rent, startDate: "2032-04-01" },
      lease,
      rules: [fivePercentYearly],
      ...rounding,
    });
    expect(amounts(steps)).toEqual([["2032-04-01", 10_000_000]]);
  });
});
