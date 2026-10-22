import { describe, expect, it } from "vitest";
import {
  expectedTds,
  settlePayment,
  tdsGroup,
  tdsQuarter,
  tenantTdsDefaults,
} from "../tds";
import type { TenantTds } from "../tds";

const company = tenantTdsDefaults({ deductsTds: true });

describe("tenantTdsDefaults", () => {
  it("is the same setting for every charge type: 10% when the tenant deducts", () => {
    expect(company).toEqual({
      rent: { deductsTds: true, tdsRateBp: 1000 },
      cam: { deductsTds: true, tdsRateBp: 1000 },
      parking: { deductsTds: true, tdsRateBp: 1000 },
      other: { deductsTds: true, tdsRateBp: 1000 },
    });
    expect(tenantTdsDefaults({ deductsTds: false }).cam).toEqual({
      deductsTds: false,
      tdsRateBp: 1000,
    });
  });
});

describe("tdsGroup", () => {
  it("puts utilities and signage under other", () => {
    expect(tdsGroup("rent")).toBe("rent");
    expect(tdsGroup("cam")).toBe("cam");
    expect(tdsGroup("parking")).toBe("parking");
    expect(tdsGroup("utilities")).toBe("other");
    expect(tdsGroup("signage")).toBe("other");
    expect(tdsGroup("other")).toBe("other");
  });
});

describe("expectedTds", () => {
  it("is the tenant's rate on the taxable value, excluding GST", () => {
    // 10% of ₹1,00,000 taxable = ₹10,000 (GST ₹18,000 not included)
    const tds = expectedTds({
      lines: [{ chargeType: "rent", taxablePaise: 10_000_000 }],
      tds: company,
    });
    expect(tds.amount).toBe(1_000_000);
    expect(tds.explanation.steps).toEqual([
      "Rent: TDS 10% of ₹1,00,000 (GST excluded)",
      "Expected TDS, to the nearest rupee = ₹10,000",
    ]);
  });

  it("uses each charge type's own setting", () => {
    const tds: TenantTds = {
      rent: { deductsTds: true, tdsRateBp: 1000 },
      cam: { deductsTds: false, tdsRateBp: 1000 },
      parking: { deductsTds: true, tdsRateBp: 200 },
      other: { deductsTds: true, tdsRateBp: 1000 },
    };
    const result = expectedTds({
      lines: [
        { chargeType: "rent", taxablePaise: 10_000_000 },
        { chargeType: "cam", taxablePaise: 2_500_000 },
        { chargeType: "parking", taxablePaise: 500_000 },
        { chargeType: "signage", taxablePaise: 333_333 },
      ],
      tds,
    });
    // Rent 10% of 1,00,000 = 10,000
    // CAM: not deducted
    // Parking 2% of 5,000 = 100
    // Signage (other) 10% of 3,333.33 = 333.333
    // Total 10,433.333 → ₹10,433
    expect(result.amount).toBe(1_043_300);
    expect(result.explanation.steps).toEqual([
      "Rent: TDS 10% of ₹1,00,000 (GST excluded)",
      "Maintenance (CAM): no TDS on ₹25,000",
      "Parking: TDS 2% of ₹5,000 (GST excluded)",
      "Other charges: TDS 10% of ₹3,333.33 (GST excluded)",
      "Expected TDS, to the nearest rupee = ₹10,433",
    ]);
  });

  it("adds lines of the same type before applying the rate", () => {
    // Rent split by an increase: 36,129.03 + 46,064.52 = 82,193.55
    // 10% = 8,219.355 → ₹8,219
    expect(
      expectedTds({
        lines: [
          { chargeType: "rent", taxablePaise: 3_612_903 },
          { chargeType: "rent", taxablePaise: 4_606_452 },
        ],
        tds: company,
      }).amount,
    ).toBe(821_900);
  });

  it("rounds to the nearest rupee", () => {
    // 2% of ₹1,06,917.75 = ₹2,138.355 → ₹2,138
    const tds = expectedTds({
      lines: [{ chargeType: "rent", taxablePaise: 10_691_775 }],
      tds: { ...company, rent: { deductsTds: true, tdsRateBp: 200 } },
    });
    expect(tds.amount).toBe(213_800);
  });

  it("rounds half a rupee up", () => {
    // 10% of ₹1,05,005 = ₹10,500.50 → ₹10,501
    expect(
      expectedTds({
        lines: [{ chargeType: "rent", taxablePaise: 10_500_500 }],
        tds: company,
      }).amount,
    ).toBe(1_050_100);
  });

  it("rounds once, on the total, straight to the rupee", () => {
    // Rent 10% of ₹49,994.95 = ₹4,999.495; CAM 10% of ₹0.05 = ₹0.005
    // Total ₹4,999.50 → ₹5,000 (rounding each type first would give ₹4,999)
    expect(
      expectedTds({
        lines: [
          { chargeType: "rent", taxablePaise: 4_999_495 },
          { chargeType: "cam", taxablePaise: 5 },
        ],
        tds: company,
      }).amount,
    ).toBe(500_000);
  });

  it("is zero when the tenant doesn't deduct TDS on any of the charges", () => {
    const result = expectedTds({
      lines: [{ chargeType: "rent", taxablePaise: 10_000_000 }],
      tds: tenantTdsDefaults({ deductsTds: false }),
    });
    expect(result.amount).toBe(0);
    expect(result.explanation.rule).toBe("No TDS");
  });

  it("refuses a rate that isn't whole basis points ≥ 0", () => {
    expect(() =>
      expectedTds({
        lines: [{ chargeType: "rent", taxablePaise: 10_000_000 }],
        tds: { ...company, rent: { deductsTds: true, tdsRateBp: -1 } },
      }),
    ).toThrow(RangeError);
  });
});

describe("settlePayment", () => {
  const invoice = {
    invoiceTotalPaise: 11_800_000,
    expectedTdsPaise: 1_000_000,
  };

  it("golden 12: ₹1,08,000 against ₹1,18,000 with ₹10,000 TDS is paid with TDS", () => {
    // 1,08,000 received + 10,000 TDS = 1,18,000 settled
    expect(settlePayment({ ...invoice, receivedPaise: 10_800_000 })).toEqual({
      status: "paid_with_tds",
      tdsDeductedPaise: 1_000_000,
      settledPaise: 11_800_000,
      excessPaise: 0,
    });
  });

  it("allows up to ₹1 difference from the expected TDS", () => {
    // short by ₹10,000.80 = TDS ₹10,000 + ₹0.80 → still paid with TDS
    expect(
      settlePayment({ ...invoice, receivedPaise: 10_799_920 }),
    ).toMatchObject({ status: "paid_with_tds", tdsDeductedPaise: 1_000_080 });
    // short by ₹9,999.00 = TDS − ₹1.00 → paid with TDS
    expect(
      settlePayment({ ...invoice, receivedPaise: 10_800_100 }),
    ).toMatchObject({ status: "paid_with_tds", tdsDeductedPaise: 999_900 });
  });

  it("includes exactly ₹1 over the expected TDS, but not ₹1.01 [CA]", () => {
    // short by ₹10,001.00 = TDS + ₹1.00 → paid with TDS (tolerance inclusive)
    expect(
      settlePayment({ ...invoice, receivedPaise: 10_799_900 }),
    ).toMatchObject({ status: "paid_with_tds", tdsDeductedPaise: 1_000_100 });
    // short by ₹10,001.01 = TDS + ₹1.01 → part-paid
    expect(
      settlePayment({ ...invoice, receivedPaise: 10_799_899 }),
    ).toMatchObject({ status: "part_paid" });
  });

  it("is part-paid when the shortfall isn't the TDS", () => {
    // short by ₹10,001.50 — more than ₹1 off the expected TDS
    expect(settlePayment({ ...invoice, receivedPaise: 10_799_850 })).toEqual({
      status: "part_paid",
      tdsDeductedPaise: 0,
      settledPaise: 10_799_850,
      excessPaise: 0,
    });
  });

  it("is paid in full, and keeps any excess as credit", () => {
    expect(settlePayment({ ...invoice, receivedPaise: 11_800_000 })).toEqual({
      status: "paid",
      tdsDeductedPaise: 0,
      settledPaise: 11_800_000,
      excessPaise: 0,
    });
    expect(
      settlePayment({ ...invoice, receivedPaise: 12_000_000 }),
    ).toMatchObject({ status: "paid", excessPaise: 200_000 });
  });

  it("is part-paid for a short payment when no TDS is expected", () => {
    expect(
      settlePayment({
        invoiceTotalPaise: 11_800_000,
        expectedTdsPaise: 0,
        receivedPaise: 11_799_950,
      }),
    ).toMatchObject({ status: "part_paid", tdsDeductedPaise: 0 });
  });
});

describe("tdsQuarter", () => {
  it("files TDS in the FY quarter of the payment date", () => {
    expect(tdsQuarter("2026-06-10")).toEqual({
      financialYear: "2026-27",
      quarter: 1,
    });
    expect(tdsQuarter("2027-02-01")).toEqual({
      financialYear: "2026-27",
      quarter: 4,
    });
  });
});
