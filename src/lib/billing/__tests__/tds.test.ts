import { describe, expect, it } from "vitest";
import { expectedTds, settlePayment, tdsQuarter } from "../tds";

describe("expectedTds", () => {
  it("is the tenant's rate on the taxable value, excluding GST", () => {
    // 10% of ₹1,00,000 taxable = ₹10,000 (GST ₹18,000 not included)
    const tds = expectedTds({
      taxablePaise: 10_000_000,
      tdsRateBp: 1000,
      deductsTds: true,
    });
    expect(tds.amount).toBe(1_000_000);
    expect(tds.explanation.steps).toEqual([
      "TDS 10% of taxable value ₹1,00,000 (GST excluded) = ₹10,000",
    ]);
  });

  it("rounds to the paisa", () => {
    // 2% of ₹1,06,917.75 = ₹2,138.355 → ₹2,138.36
    expect(
      expectedTds({
        taxablePaise: 10_691_775,
        tdsRateBp: 200,
        deductsTds: true,
      }).amount,
    ).toBe(213_836);
  });

  it("is zero when the tenant doesn't deduct TDS", () => {
    expect(
      expectedTds({
        taxablePaise: 10_000_000,
        tdsRateBp: 1000,
        deductsTds: false,
      }).amount,
    ).toBe(0);
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
