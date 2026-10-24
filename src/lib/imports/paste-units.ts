// "Paste units from Excel" on a building page: rows copied from a sheet
// (tab-separated: unit, floor, carpet area, billed area), turned into the
// import's "Units" sheet for this building, so they're checked and saved
// exactly as the Excel import does (planPropertyImport). Pure.

import type { Sheet } from "./sheets";

const HEADINGS = [
  "Building name",
  "Unit",
  "Floor",
  "Carpet area (sq ft)",
  "Billed area (sq ft)",
];

/** The pasted text as the "Units" sheet of one building; a heading row, if copied, is skipped. */
export function pastedUnitsSheet(text: string, buildingName: string): Sheet {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
  const cells = lines.map((l) =>
    (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}|,(?=\s*\S)/)).map((c) =>
      c.trim(),
    ),
  );
  const first = cells[0]?.[0]?.toLowerCase() ?? "";
  const body = /^(unit|unit no\.?|unit number)$/.test(first)
    ? cells.slice(1)
    : cells;
  return {
    name: "Units",
    rows: [
      HEADINGS,
      ...body.map(([unit = "", floor = "", carpet = "", billed = ""]) => [
        buildingName,
        unit,
        floor,
        carpet,
        billed,
      ]),
    ],
  };
}
