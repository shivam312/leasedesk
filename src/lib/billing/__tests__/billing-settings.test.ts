// The engine takes one resolved BillingSettings object (docs/SETTINGS.md).

import { describe, expect, it } from "vitest";
import { amountSteps } from "../escalation";
import { invoiceTotals, lineTax } from "../gst";
import { invoiceForRun } from "../invoice-lines";
import type { LeaseInput } from "../schedule";
import type { Charge } from "../types";
import { DEFAULT_SETTINGS, withSettings } from "./billing-settings";

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 9_001_571, // ₹90,015.71
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

const lease: LeaseInput = {
  id: "L-1",
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  charges: [rent],
  escalationRules: [{ percentBp: 500, everyMonths: 12, anchor: "lease_start" }],
};

describe("billing.roundIncreasedRent", () => {
  const stepAfterIncrease = (roundIncreasedRent: "none" | "rupee") =>
    amountSteps({
      charge: rent,
      lease,
      rules: lease.escalationRules,
      settings: withSettings({ roundIncreasedRent }),
    })[1]?.amount;

  it("rupee: ₹90,015.71 + 5% = ₹94,516.4955 → ₹94,516", () => {
    expect(stepAfterIncrease("rupee")).toBe(9_451_600);
  });

  it("none: ₹90,015.71 + 5% = ₹94,516.4955 → ₹94,516.50 (to the paisa)", () => {
    expect(stepAfterIncrease("none")).toBe(9_451_650);
  });
});

describe("billing.roundInvoiceTotal", () => {
  // ₹1,06,917.75 + CGST ₹9,622.60 + SGST ₹9,622.60 = ₹1,26,162.95
  const lines = [
    { taxablePaise: 10_691_775, ...lineTax(10_691_775, 1800, "intra_state") },
  ];

  it("rupee: ₹1,26,162.95 → ₹1,26,163 with round off +₹0.05", () => {
    expect(
      invoiceTotals(lines, withSettings({ roundInvoiceTotal: "rupee" })),
    ).toMatchObject({ roundOff: 5, grandTotal: 12_616_300 });
  });

  it("none: ₹1,26,162.95 stays, no round off", () => {
    expect(
      invoiceTotals(lines, withSettings({ roundInvoiceTotal: "none" })),
    ).toMatchObject({ roundOff: 0, grandTotal: 12_616_295 });
  });
});

describe("invoice.dueDays", () => {
  it("due date = invoice date + due days: 1 May + 7 = 8 May; + 10 = 11 May", () => {
    expect(invoiceForRun(lease, "2026-05", DEFAULT_SETTINGS)?.dueDate).toBe(
      "2026-05-08",
    );
    expect(
      invoiceForRun(lease, "2026-05", withSettings({ dueDays: 10 }))?.dueDate,
    ).toBe("2026-05-11");
  });

  it("refuses negative due days", () => {
    expect(() =>
      invoiceForRun(lease, "2026-05", withSettings({ dueDays: -1 })),
    ).toThrow(/Due days/);
  });
});
