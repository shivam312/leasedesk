import { describe, expect, it } from "vitest";
import { occupiedPercent, stackingPlan, type StackUnit } from "../stacking";

const floors = [
  { id: "g", label: "Ground", sortOrder: 0 },
  { id: "f1", label: "1st", sortOrder: 1 },
  { id: "f2", label: "2nd", sortOrder: 2 },
];
const unit = (
  code: string,
  floorId: string | null,
  area: number,
  status: StackUnit["status"] = "vacant",
): StackUnit => ({
  id: code,
  code,
  floorId,
  chargeableArea: area,
  status,
});

describe("stackingPlan", () => {
  const plan = stackingPlan(floors, [
    unit("110", "f1", 100000, "leased"),
    unit("102", "f1", 50000),
    unit("9", "f1", 25000, "leased"),
    unit("G1", "g", 80000, "fit_out"),
    unit("Kiosk", null, 2000),
  ]);

  it("puts the top floor first and units without a floor last", () => {
    expect(plan.rows.map((r) => r.label)).toEqual([
      "2nd",
      "1st",
      "Ground",
      "No floor",
    ]);
  });

  it("orders units naturally (9 before 102 before 110)", () => {
    expect(plan.rows[1]?.units.map((u) => u.code)).toEqual(["9", "102", "110"]);
  });

  it("totals billed and vacant area per floor and for the building", () => {
    expect(plan.rows[1]).toMatchObject({ area: 175000, vacantArea: 50000 });
    expect(plan.rows[0]).toMatchObject({ area: 0, vacantArea: 0, units: [] });
    expect(plan).toMatchObject({ area: 257000, vacantArea: 52000 });
  });

  it("leaves out the No floor row when every unit has a floor", () => {
    expect(stackingPlan(floors, [unit("101", "f1", 1)]).rows).toHaveLength(3);
  });
});

describe("occupiedPercent", () => {
  it("rounds down", () => {
    // 2,57,000 − 52,000 = 2,05,000 of 2,57,000 = 79.76…% → 79%
    expect(occupiedPercent(257000, 52000)).toBe(79);
    expect(occupiedPercent(100, 1)).toBe(99);
    expect(occupiedPercent(0, 0)).toBe(0);
  });
});
