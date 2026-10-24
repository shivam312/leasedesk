import { describe, expect, it } from "vitest";
import { planPropertyImport, type ExistingProperty } from "../property";
import { pastedUnitsSheet } from "../paste-units";

const existing: ExistingProperty = {
  entities: [{ id: "e1", gstin: "27AAPFU0939F1ZV", legalName: "E2E" }],
  buildings: [
    {
      id: "b1",
      name: "E2E Tower",
      billingEntityId: "e1",
      invoicePrefix: "ET",
      creditNotePrefix: "ETC",
      floors: [{ id: "f3", label: "3rd" }],
      unitCodes: ["301"],
    },
  ],
};

describe("pasted units", () => {
  it("reads rows copied from Excel, skipping a heading row", () => {
    const sheet = pastedUnitsSheet(
      "Unit\tFloor\tCarpet area\n302\t3rd\t1,200\n401\t4th\t900\t1,000\n",
      "E2E Tower",
    );
    expect(sheet.rows.slice(1)).toEqual([
      ["E2E Tower", "302", "3rd", "1,200", ""],
      ["E2E Tower", "401", "4th", "900", "1,000"],
    ]);
    const result = planPropertyImport([sheet], existing);
    expect("plan" in result).toBe(true);
    if (!("plan" in result)) return;
    // 1,200 sq ft = 1,20,000 hundredths; billed area defaults to carpet.
    expect(
      result.plan.units.map((u) => [u.code, u.carpetArea, u.chargeableArea]),
    ).toEqual([
      ["302", 120000, 120000],
      ["401", 90000, 100000],
    ]);
    // 3rd exists; 4th is a new floor.
    expect(result.plan.units[0]!.floor).toEqual({ existingId: "f3" });
    expect(result.plan.units[1]!.floor).toEqual({ newLabel: "4th" });
  });

  it("refuses a unit the building already has, as the import does", () => {
    const result = planPropertyImport(
      [pastedUnitsSheet("301\t3rd\t1000", "E2E Tower")],
      existing,
    );
    expect("errors" in result).toBe(true);
  });
});
