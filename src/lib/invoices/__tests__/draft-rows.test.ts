import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/billing/__tests__/billing-settings";
import { draftInvoice } from "@/lib/billing/draft-invoice";
import type { LeaseInput } from "@/lib/billing/schedule";
import type { Charge } from "@/lib/billing/types";
import { tenantTdsDefaults } from "@/lib/billing/tds";
import { draftChanged, invoiceRow, lineRows } from "../draft-rows";

const lease: LeaseInput = {
  id: "L-1",
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  charges: [
    {
      id: "rent",
      type: "rent",
      basis: "fixed",
      amountPaise: 9_000_000, // ₹90,000
      startDate: "2026-04-01",
      gstRateBp: 1800,
      sacCode: "997212",
    },
  ],
};
const tds = tenantTdsDefaults({ deductsTds: true });
const draft = (l: LeaseInput, settings = DEFAULT_SETTINGS) =>
  draftInvoice({
    lease: l,
    runMonth: "2026-11",
    settings,
    supply: "intra_state",
    tds,
  });

// What the run saved: November rent ₹90,000 + 18% GST = ₹1,06,200.
const made = draft(lease)!;
const stored = {
  invoice: invoiceRow(made, "intra_state"),
  lines: lineRows(made),
};

describe("draft rows", () => {
  it("puts lines in one fixed order, rent first, whatever order the lease lists them", () => {
    const fixed = (id: string, type: Charge["type"], amountPaise: number) =>
      ({
        id,
        type,
        basis: "fixed",
        amountPaise,
        startDate: "2026-04-01",
        gstRateBp: 1800,
        sacCode: "997212",
      }) satisfies Charge;
    const mixed: LeaseInput = {
      ...lease,
      charges: [
        fixed("parking", "parking", 500_000),
        fixed("cam", "cam", 1_000_000),
        fixed("rent", "rent", 9_000_000),
        fixed("other", "other", 100_000),
      ],
    };
    // Rent, maintenance (CAM), parking, then anything else; numbered 1 to 4
    // the same on screen and on the PDF (both read lines by position).
    expect(
      lineRows(draft(mixed)!).map((l) => [l.position, l.chargeId]),
    ).toEqual([
      [1, "rent"],
      [2, "cam"],
      [3, "parking"],
      [4, "other"],
    ]);
  });

  it("saves the engine's amounts as invoice and line columns", () => {
    expect(stored.invoice).toMatchObject({
      invoiceDate: "2026-11-01",
      supplyType: "intra_state",
      taxableTotal: 9_000_000,
      cgstTotal: 810_000,
      sgstTotal: 810_000,
      grandTotal: 10_620_000,
      expectedTds: 900_000,
    });
    expect(stored.lines).toMatchObject([
      {
        position: 1,
        chargeId: "rent",
        taxableAmount: 9_000_000,
        cgst: 810_000,
      },
    ]);
  });
});

describe("draftChanged", () => {
  it("is false when the lease still bills exactly the saved draft", () => {
    expect(draftChanged(stored, draft(lease), "intra_state")).toBe(false);
  });

  it("is true when the lease was ended after the draft was made", () => {
    // Ended 20 Nov: ₹90,000 × 20/30 = ₹60,000 + 18% = ₹70,800, not ₹1,06,200.
    const ended = draft({ ...lease, endDate: "2026-11-20" });
    expect(ended!.totals.grandTotal).toBe(7_080_000);
    expect(draftChanged(stored, ended, "intra_state")).toBe(true);
  });

  it("is true when there is nothing to bill any more", () => {
    expect(draftChanged(stored, null, "intra_state")).toBe(true);
  });

  it("is true when the supply type changed (same amounts, IGST instead)", () => {
    expect(draftChanged(stored, draft(lease), "inter_state")).toBe(true);
  });

  it("is true when a billing rule changed the due date", () => {
    const later = draft(lease, { ...DEFAULT_SETTINGS, dueDays: 15 });
    expect(later!.dueDate).not.toBe(made.dueDate);
    expect(draftChanged(stored, later, "intra_state")).toBe(true);
  });
});
