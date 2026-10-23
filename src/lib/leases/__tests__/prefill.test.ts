import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/settings/schema";
import { leaseTemplate } from "../copy";
import { leaseInputFor, parseLeaseForm } from "../draft";
import { bpText, leaseFormFrom, paiseText } from "../prefill";

describe("prefill", () => {
  it("writes paise and basis points as the user would type them", () => {
    expect(paiseText(12_500_050)).toBe("125000.50");
    expect(paiseText(10_000_000)).toBe("100000");
    expect(paiseText(8_505)).toBe("85.05");
    expect(bpText(500)).toBe("5");
    expect(bpText(1250)).toBe("12.5");
    expect(bpText(1805)).toBe("18.05");
  });

  it("a copied lease fills the form and reads back to the same terms", () => {
    const template = leaseTemplate({
      buildingId: "64a547af-6134-4e8b-89b0-087288c81a1a",
      areaBasis: "carpet",
      noticePeriodMonths: 3,
      rentFreeMonths: 0,
      rentFreeDays: 15,
      settings: { "billing.monthEndRule": "last_day" },
      charges: [
        {
          id: "x",
          type: "rent",
          basis: "per_sqft",
          ratePaise: 8550,
          areaHundredths: 100000,
          startDate: "2025-04-01",
          timing: "arrears",
          gstRateBp: 1800,
          sacCode: "997212",
        },
        {
          id: "y",
          type: "parking",
          basis: "per_slot",
          ratePaise: 300000,
          slots: 2,
          startDate: "2025-04-01",
        },
      ],
      escalationRules: [
        {
          percentBp: 500,
          everyMonths: 12,
          anchor: "lease_start",
          compounding: false,
        },
      ],
    });
    const form = leaseFormFrom(template);
    expect(form.tenantId).toBe("");
    expect(form.unitIds).toEqual([]);
    expect(form.rentFree).toBe("days");
    expect(form.rentFreeLength).toBe("15");
    expect(form.settings).toEqual({ billing__monthEndRule: "last_day" });
    expect(form.charges[0]).toMatchObject({
      amount: "85.50",
      timing: "arrears",
      gstRate: "18",
    });
    expect(form.charges[1]).toMatchObject({
      slots: "2",
      gstRate: "",
      timing: "",
    });

    // Fill in what a copy leaves blank, then read it back.
    const parsed = parseLeaseForm({
      ...form,
      tenantId: "6a83f208-084f-433c-930c-5093ae808f43",
      unitIds: ["0c5b3b0e-6a4c-4b8e-9d7f-1f2e3d4c5b6a"],
      startDate: "2026-04-01",
      endDate: "2029-03-31",
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const built = leaseInputFor(parsed.draft, {
      id: "L2",
      units: [
        {
          id: "0c5b3b0e-6a4c-4b8e-9d7f-1f2e3d4c5b6a",
          carpetArea: 75000,
          chargeableArea: 90000,
        },
      ],
      settings: defaultSettings(),
    });
    // Same rate on the new unit's carpet area (750 sq ft), new start date.
    expect(built.lease.charges[0]).toMatchObject({
      ratePaise: 8550,
      areaHundredths: 75000,
      startDate: "2026-04-01",
      timing: "arrears",
    });
    expect(built.lease.charges[1]).toMatchObject({
      slots: 2,
      ratePaise: 300000,
    });
    expect(built.lease.escalationRules).toEqual([
      {
        percentBp: 500,
        everyMonths: 12,
        anchor: "lease_start",
        compounding: false,
      },
    ]);
    expect(parsed.draft.settings).toEqual({
      "billing.monthEndRule": "last_day",
    });
  });
});
