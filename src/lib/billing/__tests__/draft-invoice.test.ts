import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, withSettings } from "./billing-settings";
import { draftInvoice } from "../draft-invoice";
import type { LeaseInput } from "../schedule";
import { tenantTdsDefaults } from "../tds";
import type { Charge } from "../types";

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 10_000_000, // ₹1,00,000
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

const cam: Charge = {
  id: "cam",
  type: "cam",
  basis: "fixed",
  amountPaise: 1_000_000, // ₹10,000
  startDate: "2026-04-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

const lease: LeaseInput = {
  id: "L-1",
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  charges: [rent, cam],
};

const tds = tenantTdsDefaults({ deductsTds: true });

describe("draftInvoice", () => {
  it("bills every line with GST, totals and expected TDS (same state)", () => {
    const draft = draftInvoice({
      lease,
      runMonth: "2026-11",
      settings: DEFAULT_SETTINGS,
      supply: "intra_state",
      tds,
    });
    // Rent ₹1,00,000: CGST 9% = ₹9,000, SGST ₹9,000.
    // CAM ₹10,000: CGST 9% = ₹900, SGST ₹900.
    // Taxable ₹1,10,000 + ₹19,800 GST = ₹1,29,800, no round-off.
    // TDS 10% of ₹1,00,000 + 10% of ₹10,000 = ₹11,000.
    expect(draft).toMatchObject({
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-08",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      totals: {
        taxable: 11_000_000,
        cgst: 990_000,
        sgst: 990_000,
        igst: 0,
        roundOff: 0,
        grandTotal: 12_980_000,
      },
      expectedTds: { amount: 1_100_000 },
    });
    expect(
      draft?.lines.map((l) => [
        l.description,
        l.taxablePaise,
        l.cgst,
        l.sgst,
        l.igst,
      ]),
    ).toEqual([
      ["Rent for Nov 2026", 10_000_000, 900_000, 900_000, 0],
      ["Maintenance (CAM) for Nov 2026", 1_000_000, 90_000, 90_000, 0],
    ]);
    expect(draft?.lines[0]?.taxExplanation.steps.length).toBeGreaterThan(0);
  });

  it("charges IGST when the billing GSTIN is in another state", () => {
    const draft = draftInvoice({
      lease,
      runMonth: "2026-11",
      settings: DEFAULT_SETTINGS,
      supply: "inter_state",
      tds,
    });
    // 18% of ₹1,10,000 = ₹19,800 IGST
    expect(draft?.totals).toMatchObject({ cgst: 0, sgst: 0, igst: 1_980_000 });
  });

  it("rounds the total to the rupee and TDS to the rupee (defaults)", () => {
    const area: Charge = {
      id: "rent",
      type: "rent",
      basis: "per_sqft",
      ratePaise: 8_550, // ₹85.50
      areaHundredths: 125_050, // 1,250.50 sq ft
      startDate: "2026-04-01",
      gstRateBp: 1800,
      sacCode: "997212",
    };
    const draft = draftInvoice({
      lease: { ...lease, charges: [area] },
      runMonth: "2026-11",
      settings: DEFAULT_SETTINGS,
      supply: "intra_state",
      tds,
    });
    // 1,250.50 × ₹85.50 = ₹1,06,917.75
    // CGST 9% = ₹9,622.5975 → ₹9,622.60; SGST the same
    // ₹1,06,917.75 + ₹19,245.20 = ₹1,26,162.95 → ₹1,26,163, round-off +₹0.05
    // TDS 10% of ₹1,06,917.75 = ₹10,691.775 → ₹10,692
    expect(draft?.lines[0]).toMatchObject({
      taxablePaise: 10_691_775,
      cgst: 962_260,
      sgst: 962_260,
      quantityLabel: "1,250.50 sq ft",
    });
    expect(draft?.totals).toMatchObject({
      roundOff: 5,
      grandTotal: 12_616_300,
    });
    expect(draft?.expectedTds.amount).toBe(1_069_200);
  });

  it("labels a per-slot quantity and leaves a fixed amount unlabelled", () => {
    const parking: Charge = {
      id: "parking",
      type: "parking",
      basis: "per_slot",
      ratePaise: 300_000, // ₹3,000 a slot
      slots: 2,
      startDate: "2026-04-01",
      gstRateBp: 1800,
      sacCode: "997212",
    };
    const draft = draftInvoice({
      lease: { ...lease, charges: [rent, parking] },
      runMonth: "2026-11",
      settings: DEFAULT_SETTINGS,
      supply: "intra_state",
      tds,
    });
    expect(draft?.lines.map((l) => l.quantityLabel)).toEqual([null, "2 slots"]);
    // 2 × ₹3,000 = ₹6,000
    expect(draft?.lines[1]?.taxablePaise).toBe(600_000);
  });

  it("spans the earliest to the latest line period (quarterly arrears with monthly advance)", () => {
    const quarterly: Charge = {
      ...cam,
      frequency: "quarterly",
      timing: "arrears",
    };
    const draft = draftInvoice({
      lease: { ...lease, charges: [rent, quarterly] },
      runMonth: "2026-10",
      settings: DEFAULT_SETTINGS,
      supply: "intra_state",
      tds,
    });
    // Jul–Sep CAM in arrears in the October run, with October's rent.
    expect(draft).toMatchObject({
      periodStart: "2026-07-01",
      periodEnd: "2026-10-31",
    });
  });

  it("works GST out once per invoice with gst.rounding = per_invoice", () => {
    const tiny = (id: string): Charge => ({
      id,
      type: "other",
      basis: "fixed",
      amountPaise: 10_005, // ₹100.05
      startDate: "2026-04-01",
      gstRateBp: 1800,
      sacCode: "997212",
    });
    const draft = draftInvoice({
      lease: { ...lease, charges: [tiny("a"), tiny("b"), tiny("c")] },
      runMonth: "2026-11",
      settings: withSettings({ gstRounding: "per_invoice" }),
      supply: "intra_state",
      tds,
    });
    // 9% of ₹300.15 = ₹27.0135 → ₹27.01: ₹9.01 + ₹9.00 + ₹9.00
    expect(draft?.lines.map((l) => l.cgst)).toEqual([901, 900, 900]);
    expect(draft?.totals.cgst).toBe(2_701);
  });

  it("has no TDS for a tenant who doesn't deduct", () => {
    const draft = draftInvoice({
      lease,
      runMonth: "2026-11",
      settings: DEFAULT_SETTINGS,
      supply: "intra_state",
      tds: tenantTdsDefaults({ deductsTds: false }),
    });
    expect(draft?.expectedTds.amount).toBe(0);
  });

  it("is null when there is nothing to bill", () => {
    expect(
      draftInvoice({
        lease,
        runMonth: "2026-03",
        settings: DEFAULT_SETTINGS,
        supply: "intra_state",
        tds,
      }),
    ).toBeNull();
  });
});
