import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./billing-settings";
import { tenantTdsDefaults } from "../tds";
import {
  allocatePayment,
  expectedTdsAfterCredits,
  checkAllocation,
  invoiceSettlement,
  oldestFirst,
  remainingExpectedTds,
  splitTds,
  suggestTds,
  type OpenInvoice,
} from "../allocation";

// Three monthly invoices of ₹1,18,000 (₹1,00,000 rent + 18% GST), each
// expecting ₹10,000 TDS (10% of ₹1,00,000).
const inv = (
  id: string,
  dueDate: string,
  number: string,
  over: Partial<OpenInvoice> = {},
): OpenInvoice => ({
  id,
  number,
  dueDate,
  outstandingPaise: 11_800_000,
  expectedTdsPaise: 1_000_000,
  ...over,
});
const sep = inv("sep", "2026-09-08", "B1/26-27/0001");
const oct = inv("oct", "2026-10-08", "B1/26-27/0002");
const nov = inv("nov", "2026-11-08", "B1/26-27/0003");

describe("oldestFirst", () => {
  it("orders by due date, then invoice number", () => {
    const sameDay = inv("a", "2026-10-08", "B1/26-27/0001");
    expect(oldestFirst([nov, oct, sameDay, sep]).map((i) => i.id)).toEqual([
      "sep",
      "a",
      "oct",
      "nov",
    ]);
  });

  it("leaves out invoices with nothing to pay", () => {
    const paid = inv("paid", "2026-08-08", "B1/26-27/0000", {
      outstandingPaise: 0,
    });
    expect(oldestFirst([oct, paid]).map((i) => i.id)).toEqual(["oct"]);
  });
});

describe("suggestTds", () => {
  it("golden 12: ₹1,08,000 against one ₹1,18,000 invoice is ₹10,000 TDS", () => {
    // 1,18,000 − 10,000 expected TDS = 1,08,000 received → TDS ₹10,000
    const s = suggestTds({
      receivedPaise: 10_800_000,
      invoices: [sep],
      settings: DEFAULT_SETTINGS,
    });
    expect(s.tdsPaise).toBe(1_000_000);
    expect(s.explanation.steps).toEqual([
      "Invoice B1/26-27/0001: ₹1,18,000 to pay, ₹10,000 TDS expected",
      "₹1,08,000 received is ₹1,18,000 less ₹10,000 TDS expected",
      "TDS deducted = ₹1,18,000 − ₹1,08,000 = ₹10,000",
    ]);
  });

  it("finds TDS across the oldest invoices a payment covers", () => {
    // Sep + Oct: 2,36,000 − 20,000 = 2,16,000 received → TDS ₹20,000
    expect(
      suggestTds({
        receivedPaise: 21_600_000,
        invoices: [nov, oct, sep],
        settings: DEFAULT_SETTINGS,
      }).tdsPaise,
    ).toBe(2_000_000);
  });

  it("allows ₹1 per invoice of difference from expected TDS", () => {
    // Two invoices: 2,16,000 − 1.80 received = 2,15,998.20 → TDS
    // ₹20,001.80 (₹1.80 off, within 2 × ₹1)
    expect(
      suggestTds({
        receivedPaise: 21_599_820,
        invoices: [sep, oct],
        settings: DEFAULT_SETTINGS,
      }).tdsPaise,
    ).toBe(2_000_180);
    // One invoice ₹1.01 off → not TDS
    expect(
      suggestTds({
        receivedPaise: 10_799_899,
        invoices: [sep],
        settings: DEFAULT_SETTINGS,
      }).tdsPaise,
    ).toBe(0);
  });

  it("is zero when the payment is the full amount of the oldest invoices", () => {
    // 1,18,000 = September in full, no TDS
    const s = suggestTds({
      receivedPaise: 11_800_000,
      invoices: [sep, oct],
      settings: DEFAULT_SETTINGS,
    });
    expect(s.tdsPaise).toBe(0);
    expect(s.explanation.steps.at(-1)).toBe(
      "₹1,18,000 received pays the oldest invoices in full: no TDS",
    );
  });

  it("is zero for a part payment that matches nothing", () => {
    const s = suggestTds({
      receivedPaise: 5_000_000,
      invoices: [sep],
      settings: DEFAULT_SETTINGS,
    });
    expect(s.tdsPaise).toBe(0);
    expect(s.explanation.steps.at(-1)).toBe(
      "₹50,000 doesn't match the oldest invoices less TDS: enter the TDS deducted yourself",
    );
  });

  it("is zero when the tenant doesn't deduct TDS", () => {
    // 1,18,000 − 0 TDS: 1,08,000 is just a part payment
    expect(
      suggestTds({
        receivedPaise: 10_800_000,
        invoices: [{ ...sep, expectedTdsPaise: 0 }],
        settings: DEFAULT_SETTINGS,
      }).tdsPaise,
    ).toBe(0);
  });

  it("uses the TDS setting's tolerance", () => {
    // ₹5 off with a ₹10 tolerance → TDS ₹10,005
    expect(
      suggestTds({
        receivedPaise: 10_799_500,
        invoices: [sep],
        settings: { ...DEFAULT_SETTINGS, tdsTolerancePaise: 1_000 },
      }).tdsPaise,
    ).toBe(1_000_500);
  });
});

describe("allocatePayment", () => {
  it("applies received + TDS to the oldest invoices first", () => {
    // 2,16,000 + 20,000 = 2,36,000: September and October in full
    expect(
      allocatePayment({
        receivedPaise: 21_600_000,
        tdsPaise: 2_000_000,
        invoices: [nov, oct, sep],
      }),
    ).toEqual({
      allocations: [
        { invoiceId: "sep", amountPaise: 11_800_000 },
        { invoiceId: "oct", amountPaise: 11_800_000 },
      ],
      unallocatedPaise: 0,
    });
  });

  it("part-pays the next invoice with what is left", () => {
    // 1,50,000: September ₹1,18,000, October ₹32,000
    expect(
      allocatePayment({
        receivedPaise: 15_000_000,
        tdsPaise: 0,
        invoices: [sep, oct],
      }).allocations,
    ).toEqual([
      { invoiceId: "sep", amountPaise: 11_800_000 },
      { invoiceId: "oct", amountPaise: 3_200_000 },
    ]);
  });

  it("keeps an overpayment as credit", () => {
    // 1,20,000 against 1,18,000 → ₹2,000 credit
    expect(
      allocatePayment({
        receivedPaise: 12_000_000,
        tdsPaise: 0,
        invoices: [sep],
      }),
    ).toEqual({
      allocations: [{ invoiceId: "sep", amountPaise: 11_800_000 }],
      unallocatedPaise: 200_000,
    });
  });

  it("is all credit when nothing is unpaid", () => {
    expect(
      allocatePayment({ receivedPaise: 500_000, tdsPaise: 0, invoices: [] }),
    ).toEqual({ allocations: [], unallocatedPaise: 500_000 });
  });
});

describe("splitTds", () => {
  it("gives each invoice its expected TDS, oldest first", () => {
    expect(
      splitTds({
        tdsPaise: 2_000_000,
        allocations: [
          { invoiceId: "sep", amountPaise: 11_800_000 },
          { invoiceId: "oct", amountPaise: 11_800_000 },
        ],
        invoices: [sep, oct],
      }),
    ).toEqual([
      { invoiceId: "sep", tdsPaise: 1_000_000 },
      { invoiceId: "oct", tdsPaise: 1_000_000 },
    ]);
  });

  it("puts a difference from expected TDS on the last invoice", () => {
    // ₹20,001.80 over two invoices: ₹10,000 + ₹10,001.80
    expect(
      splitTds({
        tdsPaise: 2_000_180,
        allocations: [
          { invoiceId: "sep", amountPaise: 11_800_000 },
          { invoiceId: "oct", amountPaise: 11_800_000 },
        ],
        invoices: [sep, oct],
      }),
    ).toEqual([
      { invoiceId: "sep", tdsPaise: 1_000_000 },
      { invoiceId: "oct", tdsPaise: 1_000_180 },
    ]);
  });

  it("puts less TDS than expected on the oldest invoices first", () => {
    // ₹15,000 over two: ₹10,000 + ₹5,000
    expect(
      splitTds({
        tdsPaise: 1_500_000,
        allocations: [
          { invoiceId: "sep", amountPaise: 11_800_000 },
          { invoiceId: "oct", amountPaise: 11_800_000 },
        ],
        invoices: [sep, oct],
      }),
    ).toEqual([
      { invoiceId: "sep", tdsPaise: 1_000_000 },
      { invoiceId: "oct", tdsPaise: 500_000 },
    ]);
  });

  it("never puts more TDS on an invoice than is applied to it", () => {
    // ₹3,000 applied to October with ₹10,000 TDS on September... the TDS
    // left after September's ₹10,000 is ₹2,000, within October's ₹3,000.
    expect(
      splitTds({
        tdsPaise: 1_200_000,
        allocations: [
          { invoiceId: "sep", amountPaise: 11_800_000 },
          { invoiceId: "oct", amountPaise: 300_000 },
        ],
        invoices: [sep, oct],
      }),
    ).toEqual([
      { invoiceId: "sep", tdsPaise: 1_000_000 },
      { invoiceId: "oct", tdsPaise: 200_000 },
    ]);
  });

  it("is empty with no TDS", () => {
    expect(
      splitTds({
        tdsPaise: 0,
        allocations: [{ invoiceId: "sep", amountPaise: 100 }],
        invoices: [sep],
      }),
    ).toEqual([]);
  });
});

describe("checkAllocation", () => {
  const base = {
    receivedPaise: 10_800_000,
    tdsPaise: 1_000_000,
    invoices: [sep, oct],
  };

  it("accepts what auto-allocation gives", () => {
    expect(
      checkAllocation({
        ...base,
        allocations: [{ invoiceId: "sep", amountPaise: 11_800_000 }],
      }),
    ).toBeNull();
  });

  it("accepts leaving part of the payment as credit", () => {
    expect(
      checkAllocation({
        ...base,
        tdsPaise: 0,
        allocations: [{ invoiceId: "oct", amountPaise: 5_000_000 }],
      }),
    ).toBeNull();
  });

  it("refuses applying more than the payment", () => {
    // 1,08,000 + 10,000 = 1,18,000 < 1,18,000 + ₹1
    expect(
      checkAllocation({
        ...base,
        allocations: [
          { invoiceId: "sep", amountPaise: 11_800_000 },
          { invoiceId: "oct", amountPaise: 100 },
        ],
      }),
    ).toBe(
      "You've applied ₹1,18,001 but the payment is ₹1,18,000 (₹1,08,000 received + ₹10,000 TDS).",
    );
  });

  it("refuses more than is unpaid on an invoice", () => {
    expect(
      checkAllocation({
        ...base,
        receivedPaise: 20_000_000,
        allocations: [{ invoiceId: "sep", amountPaise: 11_800_100 }],
      }),
    ).toBe("Invoice B1/26-27/0001 has only ₹1,18,000 left to pay.");
  });

  it("refuses an invoice that isn't open for this tenant", () => {
    expect(
      checkAllocation({
        ...base,
        allocations: [{ invoiceId: "elsewhere", amountPaise: 100 }],
      }),
    ).toBe("One of the invoices isn't unpaid any more. Reload and try again.");
  });

  it("refuses TDS that isn't applied to any invoice", () => {
    // ₹10,000 TDS but only ₹5,000 applied to invoices
    expect(
      checkAllocation({
        ...base,
        allocations: [{ invoiceId: "sep", amountPaise: 500_000 }],
      }),
    ).toBe(
      "TDS of ₹10,000 is more than the ₹5,000 applied to invoices. TDS is always against an invoice: apply at least that much.",
    );
  });

  it("refuses amounts beyond safe whole paise", () => {
    expect(
      checkAllocation({ ...base, receivedPaise: 1.5, allocations: [] }),
    ).toBe("Enter the amount received.");
    expect(
      checkAllocation({
        ...base,
        tdsPaise: Number.MAX_SAFE_INTEGER + 2,
        allocations: [],
      }),
    ).toBe("Enter the TDS deducted in rupees, or 0.");
  });

  it("refuses zero, negative or repeated amounts", () => {
    expect(
      checkAllocation({
        ...base,
        receivedPaise: 0,
        tdsPaise: 0,
        allocations: [],
      }),
    ).toBe("Enter the amount received.");
    expect(
      checkAllocation({
        ...base,
        allocations: [{ invoiceId: "sep", amountPaise: -1 }],
      }),
    ).toBe("Amounts to apply can't be negative.");
    expect(
      checkAllocation({
        ...base,
        allocations: [
          { invoiceId: "sep", amountPaise: 100 },
          { invoiceId: "sep", amountPaise: 100 },
        ],
      }),
    ).toBe("Each invoice can appear only once.");
  });
});

describe("remainingExpectedTds", () => {
  it("is the invoice's expected TDS less TDS already recorded", () => {
    expect(
      remainingExpectedTds({
        expectedTdsPaise: 1_000_000,
        tdsRecordedPaise: 400_000,
        outstandingPaise: 7_000_000,
      }),
    ).toBe(600_000);
  });

  it("is never below zero or above what is left to pay", () => {
    expect(
      remainingExpectedTds({
        expectedTdsPaise: 1_000_000,
        tdsRecordedPaise: 1_200_000,
        outstandingPaise: 100,
      }),
    ).toBe(0);
    expect(
      remainingExpectedTds({
        expectedTdsPaise: 1_000_000,
        tdsRecordedPaise: 0,
        outstandingPaise: 300_000,
      }),
    ).toBe(300_000);
  });
});

describe("expectedTdsAfterCredits [CA] (D-017)", () => {
  const company = tenantTdsDefaults({ deductsTds: true });

  it("keeps the invoice's own expected TDS when nothing is credited", () => {
    // Stored ₹10,000 stays, even if the tenant's rate changed since
    expect(
      expectedTdsAfterCredits({
        storedExpectedTdsPaise: 1_000_000,
        lines: [
          {
            chargeType: "rent",
            taxablePaise: 10_000_000,
            creditedTaxablePaise: 0,
          },
        ],
        tds: { ...company, rent: { deductsTds: true, tdsRateBp: 200 } },
        settings: DEFAULT_SETTINGS,
      }),
    ).toBe(1_000_000);
  });

  it("works TDS out again on the taxable value left", () => {
    // ₹50,000 of ₹1,00,000 rent credited: 10% of ₹50,000 = ₹5,000
    expect(
      expectedTdsAfterCredits({
        storedExpectedTdsPaise: 1_000_000,
        lines: [
          {
            chargeType: "rent",
            taxablePaise: 10_000_000,
            creditedTaxablePaise: 5_000_000,
          },
        ],
        tds: company,
        settings: DEFAULT_SETTINGS,
      }),
    ).toBe(500_000);
  });

  it("follows each charge type's own setting", () => {
    // Rent ₹1,00,000 at 10%, utilities ₹20,000 with no TDS (other off).
    // Crediting all the utilities leaves 10% of ₹1,00,000 = ₹10,000, not
    // a share of ₹10,000 by taxable value (₹8,333).
    const tds = { ...company, other: { deductsTds: false, tdsRateBp: 1000 } };
    expect(
      expectedTdsAfterCredits({
        storedExpectedTdsPaise: 1_000_000,
        lines: [
          {
            chargeType: "rent",
            taxablePaise: 10_000_000,
            creditedTaxablePaise: 0,
          },
          {
            chargeType: "utilities",
            taxablePaise: 2_000_000,
            creditedTaxablePaise: 2_000_000,
          },
        ],
        tds,
        settings: DEFAULT_SETTINGS,
      }),
    ).toBe(1_000_000);
    // Crediting all the rent instead leaves utilities only: ₹0
    expect(
      expectedTdsAfterCredits({
        storedExpectedTdsPaise: 1_000_000,
        lines: [
          {
            chargeType: "rent",
            taxablePaise: 10_000_000,
            creditedTaxablePaise: 10_000_000,
          },
          {
            chargeType: "utilities",
            taxablePaise: 2_000_000,
            creditedTaxablePaise: 0,
          },
        ],
        tds,
        settings: DEFAULT_SETTINGS,
      }),
    ).toBe(0);
  });

  it("rounds per tds.rounding", () => {
    // ₹33,333.33 credited of ₹1,00,000: 10% of ₹66,666.67 = ₹6,666.667
    const lines = [
      {
        chargeType: "rent" as const,
        taxablePaise: 10_000_000,
        creditedTaxablePaise: 3_333_333,
      },
    ];
    expect(
      expectedTdsAfterCredits({
        storedExpectedTdsPaise: 1_000_000,
        lines,
        tds: company,
        settings: DEFAULT_SETTINGS,
      }),
    ).toBe(666_700); // ₹6,667
    expect(
      expectedTdsAfterCredits({
        storedExpectedTdsPaise: 1_000_000,
        lines,
        tds: company,
        settings: { ...DEFAULT_SETTINGS, tdsRounding: "paisa" },
      }),
    ).toBe(666_667); // ₹6,666.67
  });
});

describe("invoiceSettlement", () => {
  it("is paid when payments and credit notes cover the total", () => {
    // 1,08,000 + 10,000 TDS = 1,18,000
    expect(
      invoiceSettlement({
        grandTotalPaise: 11_800_000,
        allocatedPaise: 11_800_000,
        creditedPaise: 0,
      }),
    ).toEqual({ status: "paid", outstandingPaise: 0 });
    expect(
      invoiceSettlement({
        grandTotalPaise: 11_800_000,
        allocatedPaise: 5_900_000,
        creditedPaise: 5_900_000,
      }),
    ).toEqual({ status: "paid", outstandingPaise: 0 });
  });

  it("is part paid in between, and unpaid with nothing applied", () => {
    expect(
      invoiceSettlement({
        grandTotalPaise: 11_800_000,
        allocatedPaise: 100,
        creditedPaise: 0,
      }),
    ).toEqual({ status: "part_paid", outstandingPaise: 11_799_900 });
    expect(
      invoiceSettlement({
        grandTotalPaise: 11_800_000,
        allocatedPaise: 0,
        creditedPaise: 1_000,
      }),
    ).toEqual({ status: "unpaid", outstandingPaise: 11_799_000 });
  });

  it("never shows less than nothing left to pay", () => {
    // Credit note after payment (D-019): ₹59,000 more settled than owed
    expect(
      invoiceSettlement({
        grandTotalPaise: 11_800_000,
        allocatedPaise: 11_800_000,
        creditedPaise: 5_900_000,
      }),
    ).toEqual({ status: "paid", outstandingPaise: 0 });
  });
});
