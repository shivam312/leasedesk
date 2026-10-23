// billing.midMonthIncreaseLines, billing.afterCustomIncrease and
// billing.skipZeroInvoices (docs/SETTINGS.md), every option.

import { describe, expect, it } from "vitest";
import { amountSteps } from "../escalation";
import { lineTax } from "../gst";
import { invoiceForRun } from "../invoice-lines";
import type { LeaseInput } from "../schedule";
import type { Charge, CustomEscalation, EscalationRule } from "../types";
import { withSettings } from "./billing-settings";

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 9_000_000, // ₹90,000 a month
  startDate: "2026-04-16",
  gstRateBp: 1800,
  sacCode: "997212",
};

// 5% every 12 months from 16 Apr 2026: the April 2027 bill splits on 16 Apr.
const lease: LeaseInput = {
  id: "L-1",
  startDate: "2026-04-16",
  endDate: "2031-04-15",
  charges: [rent],
  escalationRules: [{ percentBp: 500, everyMonths: 12, anchor: "lease_start" }],
};

describe("billing.midMonthIncreaseLines", () => {
  // 1–15 Apr 2027 at ₹90,000: 90,000 × 15 ÷ 30 = ₹45,000.00
  // 16–30 Apr 2027 at ₹94,500: 94,500 × 15 ÷ 30 = ₹47,250.00
  it("two_lines (default): one line per part of the month", () => {
    const lines = invoiceForRun(
      lease,
      "2027-04",
      withSettings({ midMonthIncreaseLines: "two_lines" }),
    )?.lines;
    expect(
      lines?.map((l) => [l.periodStart, l.periodEnd, l.taxablePaise]),
    ).toEqual([
      ["2027-04-01", "2027-04-15", 4_500_000],
      ["2027-04-16", "2027-04-30", 4_725_000],
    ]);
  });

  it("one_line: one line for the month, the sum of the parts: ₹45,000 + ₹47,250 = ₹92,250", () => {
    const lines = invoiceForRun(
      lease,
      "2027-04",
      withSettings({ midMonthIncreaseLines: "one_line" }),
    )?.lines;
    expect(lines).toHaveLength(1);
    expect(lines?.[0]).toMatchObject({
      description: "Rent for Apr 2027",
      periodStart: "2027-04-01",
      periodEnd: "2027-04-30",
      taxablePaise: 9_225_000,
    });
    // The explanation still shows both parts.
    const steps = lines?.[0]?.explanation.steps.join("\n") ?? "";
    expect(steps).toContain("₹45,000");
    expect(steps).toContain("₹47,250");
    expect(steps).toContain("₹92,250");
  });

  it("one_line leaves a month without an increase unchanged", () => {
    const lines = invoiceForRun(
      lease,
      "2027-05",
      withSettings({ midMonthIncreaseLines: "one_line" }),
    )?.lines;
    expect(lines?.map((l) => [l.description, l.taxablePaise])).toEqual([
      ["Rent for May 2027", 9_450_000],
    ]);
  });
});

describe("billing.afterCustomIncrease (D-002)", () => {
  const charge: Charge = {
    ...rent,
    amountPaise: 10_000_000,
    startDate: "2026-04-01",
  };
  const terms = { id: "L-2", startDate: "2026-04-01", endDate: "2031-03-31" };
  const rule: EscalationRule = {
    percentBp: 500,
    everyMonths: 12,
    anchor: "lease_start",
  };
  // Renegotiated to ₹1,20,000 from 1 Oct 2027.
  const custom: CustomEscalation[] = [
    {
      chargeId: "rent",
      effectiveDate: "2027-10-01",
      newAmountPaise: 12_000_000,
    },
  ];
  const steps = (afterCustomIncrease: "stop_rule" | "resume_rule", r = rule) =>
    amountSteps({
      charge,
      lease: terms,
      rules: [r],
      custom,
      settings: withSettings({ afterCustomIncrease }),
    }).map((s) => [s.from, s.amount]);

  it("stop_rule (default): no automatic increases after the custom one", () => {
    // 1 Apr 2027: 1,00,000 + 5% = 1,05,000; 1 Oct 2027: agreed 1,20,000; then nothing.
    expect(steps("stop_rule")).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
      ["2027-10-01", 12_000_000],
    ]);
  });

  it("resume_rule: 5% every 12 months again, counted from the custom increase", () => {
    // 1 Oct 2028: 1,20,000 × 1.05 = 1,26,000
    // 1 Oct 2029: 1,26,000 × 1.05 = 1,32,300
    // 1 Oct 2030: 1,32,300 × 1.05 = 1,38,915
    // (not on the old 1 Apr dates: never earlier than 12 months after the custom increase)
    expect(steps("resume_rule")).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-04-01", 10_500_000],
      ["2027-10-01", 12_000_000],
      ["2028-10-01", 12_600_000],
      ["2029-10-01", 13_230_000],
      ["2030-10-01", 13_891_500],
    ]);
  });

  it("resume_rule, non-compounding: steps are on the custom amount", () => {
    // 1,20,000 + 1 × 5% = 1,26,000; + 2 × 5% = 1,32,000; + 3 × 5% = 1,38,000
    expect(
      steps("resume_rule", { ...rule, compounding: false }).slice(3),
    ).toEqual([
      ["2028-10-01", 12_600_000],
      ["2029-10-01", 13_200_000],
      ["2030-10-01", 13_800_000],
    ]);
  });

  it("resume_rule stops again at the next custom increase", () => {
    const two: CustomEscalation[] = [
      ...custom,
      { chargeId: "rent", effectiveDate: "2029-01-01", percentBp: 1000 },
    ];
    const result = amountSteps({
      charge,
      lease: terms,
      rules: [rule],
      custom: two,
      settings: withSettings({ afterCustomIncrease: "resume_rule" }),
    }).map((s) => [s.from, s.amount]);
    // 1 Oct 2028: 1,26,000; 1 Jan 2029: + 10% = 1,38,600;
    // 1 Jan 2030: + 5% = 1,45,530; 1 Jan 2031: + 5% = 1,52,806.50 → ₹1,52,807 (rupee rounding)
    expect(result.slice(3)).toEqual([
      ["2028-10-01", 12_600_000],
      ["2029-01-01", 13_860_000],
      ["2030-01-01", 14_553_000],
      ["2031-01-01", 15_280_700],
    ]);
  });
});

describe("billing.skipZeroInvoices", () => {
  // A ₹0 parking charge: nothing to bill in May.
  const zero: LeaseInput = {
    id: "L-3",
    startDate: "2026-04-01",
    endDate: "2029-03-31",
    charges: [
      {
        id: "parking",
        type: "parking",
        basis: "fixed",
        amountPaise: 0,
        startDate: "2026-04-01",
        gstRateBp: 1800,
        sacCode: "997212",
      },
    ],
  };

  it("true (default): no invoice, so no invoice number is used on ₹0", () => {
    expect(
      invoiceForRun(zero, "2026-05", withSettings({ skipZeroInvoices: true })),
    ).toBeNull();
  });

  it("false: a ₹0 invoice with its ₹0 line", () => {
    const invoice = invoiceForRun(
      zero,
      "2026-05",
      withSettings({ skipZeroInvoices: false }),
    );
    expect(invoice?.lines.map((l) => [l.chargeId, l.taxablePaise])).toEqual([
      ["parking", 0],
    ]);
  });

  it("false: still no invoice when nothing falls in the month", () => {
    expect(
      invoiceForRun(zero, "2029-05", withSettings({ skipZeroInvoices: false })),
    ).toBeNull();
  });

  it("true: drops ₹0 lines from an invoice that has other lines", () => {
    const mixed: LeaseInput = {
      ...zero,
      charges: [...zero.charges, { ...rent, startDate: "2026-04-01" }],
    };
    expect(
      invoiceForRun(
        mixed,
        "2026-05",
        withSettings({ skipZeroInvoices: true }),
      )?.lines.map((l) => l.chargeId),
    ).toEqual(["rent"]);
    expect(
      invoiceForRun(
        mixed,
        "2026-05",
        withSettings({ skipZeroInvoices: false }),
      )?.lines.map((l) => l.chargeId),
    ).toEqual(["parking", "rent"]);
  });
});

describe("edge cases found in review", () => {
  it("one_line works out GST on the combined line, which can be 1 paisa lower per tax [CA]", () => {
    // ₹90,000 a month from 16 Jul 2026, +5% on 16 Jul 2027. July 2027 has 31 days.
    // Two lines: 90,000 × 15/31 = 43,548.387 → ₹43,548.39; CGST 9% = 3,919.3551 → ₹3,919.36
    //            94,500 × 16/31 = 48,774.193 → ₹48,774.19; CGST 9% = 4,389.6771 → ₹4,389.68
    //            CGST ₹8,309.04
    // One line:  ₹92,322.58 × 9% = 8,309.0322 → ₹8,309.03
    const july: LeaseInput = {
      ...lease,
      startDate: "2026-07-16",
      endDate: "2031-07-15",
      charges: [{ ...rent, startDate: "2026-07-16" }],
    };
    const cgst = (midMonthIncreaseLines: "one_line" | "two_lines") =>
      (
        invoiceForRun(july, "2027-07", withSettings({ midMonthIncreaseLines }))
          ?.lines ?? []
      )
        .map((l) => lineTax(l.taxablePaise, l.gstRateBp, "intra_state").cgst)
        .reduce((a, b) => a + b, 0);
    expect(cgst("two_lines")).toBe(830_904);
    expect(cgst("one_line")).toBe(830_903);
  });

  const charge: Charge = {
    ...rent,
    amountPaise: 10_000_000,
    startDate: "2026-04-01",
  };
  const terms = { id: "L-4", startDate: "2026-04-01", endDate: "2031-03-31" };
  const resume = (rules: EscalationRule[], custom: CustomEscalation[]) =>
    amountSteps({
      charge,
      lease: terms,
      rules,
      custom,
      settings: withSettings({ afterCustomIncrease: "resume_rule" }),
    }).map((s) => [s.from, s.amount]);

  it("resume_rule never brings an increase before the rule's own first date", () => {
    // Rule: 5% every 12 months from 1 Jan 2028 → first increase 1 Jan 2029.
    // Custom +10% on 1 Jun 2027: 1,00,000 → 1,10,000.
    // Resumed dates: 1 Jun 2028 (before 1 Jan 2029: skipped), 1 Jun 2029, 1 Jun 2030.
    // 1,10,000 × 1.05 = 1,15,500; × 1.05 = 1,21,275
    expect(
      resume(
        [
          {
            percentBp: 500,
            everyMonths: 12,
            anchor: "custom",
            anchorDate: "2028-01-01",
          },
        ],
        [{ chargeId: "rent", effectiveDate: "2027-06-01", percentBp: 1000 }],
      ),
    ).toEqual([
      ["2026-04-01", 10_000_000],
      ["2027-06-01", 11_000_000],
      ["2029-06-01", 11_550_000],
      ["2030-06-01", 12_127_500],
    ]);
  });

  it("resume_rule: a resumed date on the next custom date gives way to the custom one", () => {
    // Customs on 1 Oct 2027 (₹1,20,000) and 1 Oct 2028 (₹1,25,000): the resumed
    // 1 Oct 2028 increase is dropped; the rule resumes again from 1 Oct 2028.
    // 1 Oct 2029: 1,25,000 × 1.05 = 1,31,250; 1 Oct 2030: × 1.05 = 1,37,812.50 → ₹1,37,813
    expect(
      resume(
        [{ percentBp: 500, everyMonths: 12, anchor: "lease_start" }],
        [
          {
            chargeId: "rent",
            effectiveDate: "2027-10-01",
            newAmountPaise: 12_000_000,
          },
          {
            chargeId: "rent",
            effectiveDate: "2028-10-01",
            newAmountPaise: 12_500_000,
          },
        ],
      ).slice(2),
    ).toEqual([
      ["2027-10-01", 12_000_000],
      ["2028-10-01", 12_500_000],
      ["2029-10-01", 13_125_000],
      ["2030-10-01", 13_781_300],
    ]);
  });

  it("resume_rule ignores a custom entry after the lease ends", () => {
    expect(
      resume(
        [{ percentBp: 500, everyMonths: 12, anchor: "lease_start" }],
        [{ chargeId: "rent", effectiveDate: "2031-06-01", newAmountPaise: 1 }],
      ).map(([from]) => from),
    ).toEqual([
      "2026-04-01",
      "2027-04-01",
      "2028-04-01",
      "2029-04-01",
      "2030-04-01",
    ]);
  });

  it("resume_rule, non-compounding after a custom percentage: steps on the raised amount", () => {
    // 1 Apr 2027: 1,05,000 (rule). Custom +10% on 1 Oct 2027: 1,15,500.
    // Then 1,15,500 + 1 × 5% = 1,21,275; + 2 × 5% = 1,27,050; + 3 × 5% = 1,32,825
    expect(
      resume(
        [
          {
            percentBp: 500,
            everyMonths: 12,
            anchor: "lease_start",
            compounding: false,
          },
        ],
        [{ chargeId: "rent", effectiveDate: "2027-10-01", percentBp: 1000 }],
      ).slice(1),
    ).toEqual([
      ["2027-04-01", 10_500_000],
      ["2027-10-01", 11_550_000],
      ["2028-10-01", 12_127_500],
      ["2029-10-01", 12_705_000],
      ["2030-10-01", 13_282_500],
    ]);
  });

  it("skipZeroInvoices false: rent-free months still have no invoice (waived charges aren't billed at all)", () => {
    const rentFree: LeaseInput = {
      id: "L-5",
      startDate: "2026-04-01",
      endDate: "2029-03-31",
      rentFreeMonths: 2,
      charges: [{ ...rent, startDate: "2026-04-01" }],
    };
    expect(
      invoiceForRun(
        rentFree,
        "2026-04",
        withSettings({ skipZeroInvoices: false }),
      ),
    ).toBeNull();
  });
});
