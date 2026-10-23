// Excel import of buildings and units (docs/PRODUCT_PLAN.md, "Excel
// import"): a "Buildings" sheet and a "Units" sheet, checked row by row with
// the same rules as the forms. Nothing is saved unless every row is right.
// Pure: sheets and what's already saved in, a plan or row errors out.

import { GST_STATES } from "@/lib/india/identifiers";
import {
  buildingSchema,
  floorSchema,
  prefixClash,
  unitSchema,
} from "@/lib/property/forms";
import {
  findSheet,
  readRows,
  sortErrors,
  type ColumnSpec,
  type RowError,
  type Sheet,
} from "./sheets";

export const BUILDING_COLUMNS = [
  { key: "name", heading: "Building name", required: true },
  { key: "address", heading: "Address", required: true },
  { key: "city", heading: "City", required: true },
  { key: "state", heading: "State", required: true },
  { key: "invoicePrefix", heading: "Invoice prefix", required: true },
  { key: "creditNotePrefix", heading: "Credit note prefix" },
  { key: "gstin", heading: "Our GSTIN" },
] as const satisfies readonly ColumnSpec[];

export const UNIT_COLUMNS = [
  { key: "building", heading: "Building name", required: true },
  { key: "floor", heading: "Floor" },
  { key: "unit", heading: "Unit", required: true },
  { key: "carpetArea", heading: "Carpet area (sq ft)", required: true },
  { key: "billedArea", heading: "Billed area (sq ft)" },
] as const satisfies readonly ColumnSpec[];

export type ExistingProperty = {
  entities: { id: string; gstin: string | null; legalName: string }[];
  buildings: {
    id: string;
    name: string;
    billingEntityId: string;
    invoicePrefix: string;
    creditNotePrefix: string;
    floors: { id: string; label: string }[];
    unitCodes: string[];
  }[];
};

export type NewBuilding = {
  /** A key for the plan, not a database id. */
  key: string;
  row: number;
  name: string;
  address: string;
  city: string;
  stateCode: string;
  billingEntityId: string;
  invoicePrefix: string;
  creditNotePrefix: string;
};

export type NewUnit = {
  row: number;
  /** An existing building's id, or a new building's key. */
  building: { existingId: string } | { newKey: string };
  /** An existing floor's id, a floor label to add, or none. */
  floor: { existingId: string } | { newLabel: string } | null;
  code: string;
  carpetArea: number;
  chargeableArea: number;
};

export type PropertyPlan = { buildings: NewBuilding[]; units: NewUnit[] };

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "27", "Maharashtra" or "maharashtra" → "27"; null if not a state. */
export function stateCodeOf(text: string): string | null {
  const t = text.trim();
  if (/^\d{1,2}$/.test(t)) {
    const code = t.padStart(2, "0");
    return code in GST_STATES ? code : null;
  }
  const found = Object.entries(GST_STATES).find(([, n]) => key(n) === key(t));
  return found ? found[0] : null;
}

const firstMessage = (error: { issues: { message: string }[] }) =>
  error.issues[0]?.message ?? "Check this row.";

export function planPropertyImport(
  sheets: readonly Sheet[],
  existing: ExistingProperty,
): { plan: PropertyPlan } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const buildingSheet = findSheet(sheets, "Buildings");
  const unitSheet = findSheet(sheets, "Units");
  if (!buildingSheet && !unitSheet)
    return {
      errors: [
        {
          sheet: "File",
          row: 0,
          message:
            'This file has no "Buildings" or "Units" sheet. Download the template and copy your rows into it.',
        },
      ],
    };

  // Buildings
  const byName = new Map(existing.buildings.map((b) => [key(b.name), b]));
  const newBuildings: NewBuilding[] = [];
  // Buildings whose own row has an error: their units wait for that fix.
  const failed = new Set<string>();
  const prefixesByEntity = new Map<
    string,
    { invoicePrefix: string; creditNotePrefix: string }[]
  >();
  for (const b of existing.buildings)
    prefixesByEntity.set(b.billingEntityId, [
      ...(prefixesByEntity.get(b.billingEntityId) ?? []),
      b,
    ]);
  if (buildingSheet) {
    const read = readRows(buildingSheet, BUILDING_COLUMNS);
    if ("error" in read) errors.push(read.error);
    else
      for (const { row, values: v } of read.rows) {
        const err = (message: string) => {
          errors.push({ sheet: buildingSheet.name, row, message });
          failed.add(key(v.name));
        };
        if (
          byName.has(key(v.name)) ||
          newBuildings.some((n) => key(n.name) === key(v.name))
        ) {
          err(
            byName.has(key(v.name))
              ? `${v.name} is already saved. Take it out of the Buildings sheet; its units can still be in the Units sheet.`
              : `${v.name} is in the Buildings sheet twice.`,
          );
          continue;
        }
        const stateCode = stateCodeOf(v.state);
        if (!stateCode) {
          err(
            `"${v.state}" isn't an Indian state. Type its name, like Maharashtra, or its GST code, like 27.`,
          );
          continue;
        }
        const gstin = v.gstin.toUpperCase();
        const entity = gstin
          ? existing.entities.find((e) => e.gstin === gstin)
          : existing.entities.length === 1
            ? existing.entities[0]
            : undefined;
        if (!entity) {
          err(
            gstin
              ? `${gstin} isn't one of your GSTINs. Add it in Settings → Business details first, or leave it blank.`
              : existing.entities.length === 0
                ? "Add your business details in Settings first."
                : "You bill from more than one GSTIN: type which one this building bills from in Our GSTIN.",
          );
          continue;
        }
        const parsed = buildingSchema.safeParse({
          name: v.name,
          address: v.address,
          city: v.city,
          stateCode,
          billingEntityId: entity.id,
          invoicePrefix: v.invoicePrefix,
          creditNotePrefix: v.creditNotePrefix,
        });
        if (!parsed.success) {
          err(firstMessage(parsed.error));
          continue;
        }
        const others = prefixesByEntity.get(entity.id) ?? [];
        const clash = prefixClash(parsed.data, others);
        if (clash) {
          err(Object.values(clash)[0]!);
          continue;
        }
        prefixesByEntity.set(entity.id, [...others, parsed.data]);
        newBuildings.push({
          key: `new:${newBuildings.length}`,
          row,
          ...parsed.data,
        });
      }
  }

  // Units
  const units: NewUnit[] = [];
  if (unitSheet) {
    const read = readRows(unitSheet, UNIT_COLUMNS);
    if ("error" in read) errors.push(read.error);
    else {
      const codes = new Map<string, Set<string>>();
      for (const b of existing.buildings)
        codes.set(b.id, new Set(b.unitCodes.map(key)));
      for (const { row, values: v } of read.rows) {
        const err = (message: string) =>
          errors.push({ sheet: unitSheet.name, row, message });
        const saved = byName.get(key(v.building));
        const fresh = newBuildings.find((n) => key(n.name) === key(v.building));
        if (!saved && !fresh && failed.has(key(v.building))) continue;
        if (!saved && !fresh) {
          err(
            v.building
              ? `There's no building called ${v.building}. Add it to the Buildings sheet, or check the spelling.`
              : "Type the building's name.",
          );
          continue;
        }
        const buildingKey = saved ? saved.id : fresh!.key;
        const parsed = unitSchema.safeParse({
          code: v.unit,
          floorId: "",
          carpetArea: v.carpetArea,
          chargeableArea: v.billedArea,
          status: "vacant",
        });
        if (!parsed.success) {
          err(firstMessage(parsed.error));
          continue;
        }
        const seen = codes.get(buildingKey) ?? new Set<string>();
        codes.set(buildingKey, seen);
        if (seen.has(key(parsed.data.code))) {
          err(`${v.building} already has a unit ${parsed.data.code}.`);
          continue;
        }
        seen.add(key(parsed.data.code));
        let floor: NewUnit["floor"] = null;
        if (v.floor) {
          const label = floorSchema.safeParse({ label: v.floor });
          if (!label.success) {
            err(firstMessage(label.error));
            continue;
          }
          const f = saved?.floors.find((f) => key(f.label) === key(v.floor));
          floor = f ? { existingId: f.id } : { newLabel: label.data.label };
        }
        units.push({
          row,
          building: saved ? { existingId: saved.id } : { newKey: fresh!.key },
          floor,
          code: parsed.data.code,
          carpetArea: parsed.data.carpetArea,
          chargeableArea: parsed.data.chargeableArea,
        });
      }
    }
  }
  if (errors.length > 0) return { errors: sortErrors(errors) };
  if (newBuildings.length === 0 && units.length === 0)
    return {
      errors: [
        {
          sheet: "File",
          row: 0,
          message: "The sheets have headings but no rows to import.",
        },
      ],
    };
  return { plan: { buildings: newBuildings, units } };
}

export const PROPERTY_TEMPLATE = {
  title: "Buildings and units",
  intro: [
    "Type one building per row in the Buildings sheet, and one unit per row in the Units sheet.",
    "A unit can be in a building you already added in the app: leave that building out of the Buildings sheet.",
    "Nothing is saved unless every row is right; the app lists each row to fix.",
  ],
  sheets: [
    {
      name: "Buildings",
      columns: BUILDING_COLUMNS,
      help: {
        name: "The building's name, as tenants know it",
        address: "Street address",
        city: "City",
        state: "State name or its GST code (27 for Maharashtra)",
        invoicePrefix:
          "1 to 5 letters or digits at the start of invoice numbers",
        creditNotePrefix: "Blank for the invoice prefix and CN",
        gstin: "Which of your GSTINs bills rent here; blank if you have one",
      },
      example: {
        name: "Orchid Towers",
        address: "Plot 12, MIDC, Andheri East",
        city: "Mumbai",
        state: "Maharashtra",
        invoicePrefix: "OT",
        creditNotePrefix: "",
        gstin: "",
      },
    },
    {
      name: "Units",
      columns: UNIT_COLUMNS,
      help: {
        building: "The building's name, exactly as in Buildings or the app",
        floor: "Optional, like Ground or 3rd; added if new",
        unit: "The unit number, like 301",
        carpetArea: "In sq ft, like 1250 or 1250.50",
        billedArea: "In sq ft; blank for the same as carpet area",
      },
      example: {
        building: "Orchid Towers",
        floor: "3rd",
        unit: "301",
        carpetArea: "1250",
        billedArea: "1625",
      },
    },
  ],
} as const;
