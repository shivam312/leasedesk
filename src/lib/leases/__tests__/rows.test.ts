import { describe, expect, it } from "vitest";
import type { SavedCharge } from "@/lib/settings/charge-defaults";
import {
  chargeToRow,
  rowToCharge,
  rowToRule,
  ruleToRow,
  savedLeaseInput,
} from "../rows";

const common = {
  type: "rent" as const,
  startDate: "2026-04-01",
  timing: "advance" as const,
  gstRateBp: 1800,
  sacCode: "997212",
};

describe("lease rows", () => {
  it("round-trips each charge basis through a lease_charges row", () => {
    const charges: SavedCharge[] = [
      // ₹1,00,000 a month, fixed.
      { ...common, id: "a", basis: "fixed", amountPaise: 10_000_000 },
      // ₹100 per sq ft on 1,000 sq ft (area comes from the lease units).
      {
        ...common,
        id: "b",
        basis: "per_sqft",
        ratePaise: 10000,
        areaHundredths: 100000,
        endDate: "2027-03-31",
        frequency: "quarterly",
        waivedDuringRentFree: false,
      },
      // ₹3,000 per slot × 2 slots.
      {
        ...common,
        id: "c",
        type: "parking",
        basis: "per_slot",
        ratePaise: 300000,
        slots: 2,
        label: "Basement",
      },
    ];
    const rows = charges.map(chargeToRow);
    expect(rows.map((r) => [r.rateOrAmount, r.quantity])).toEqual([
      [10_000_000, null],
      [10000, null],
      [300000, 2],
    ]);
    expect(rows[0]!.waivedDuringRentFree).toBe(true);
    expect(rows[2]!.waivedDuringRentFree).toBe(false);
    const back = rows.map((r) => rowToCharge(r, 100000));
    expect(back[1]).toEqual(charges[1]);
    expect(back[2]).toMatchObject({ slots: 2, label: "Basement" });
    expect(back[0]).toMatchObject({
      amountPaise: 10_000_000,
      frequency: "monthly",
    });
  });

  it("round-trips rent-increase rules", () => {
    const rule = {
      percentBp: 500,
      everyMonths: 12,
      anchor: "custom" as const,
      anchorDate: "2026-07-01",
      compounding: false,
    };
    expect(rowToRule(ruleToRow(rule))).toEqual(rule);
    expect(ruleToRow({ ...rule, appliesTo: "rent" }).chargeIds).toBeNull();
  });

  it("gives a per-sq-ft charge the total area of the lease units", () => {
    const row = chargeToRow({
      ...common,
      id: "b",
      basis: "per_sqft",
      ratePaise: 10000,
      areaHundredths: 0,
    });
    // 800 + 200 sq ft = 1,00,000 hundredths.
    const input = savedLeaseInput(
      {
        id: "L1",
        startDate: "2026-04-01",
        endDate: "2029-03-31",
        rentFreeMonths: 0,
        rentFreeDays: 0,
      },
      [{ area: 80000 }, { area: 20000 }],
      [row],
      [],
      [
        {
          chargeId: "b",
          effectiveDate: "2027-04-01",
          newAmount: null,
          percentBp: 700,
        },
      ],
    );
    expect(input.charges[0]).toMatchObject({ areaHundredths: 100000 });
    expect(input.customEscalations).toEqual([
      { chargeId: "b", effectiveDate: "2027-04-01", percentBp: 700 },
    ]);
  });
});
