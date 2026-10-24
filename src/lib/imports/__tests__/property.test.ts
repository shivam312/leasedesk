import { read, utils, write } from "xlsx";
import { describe, expect, it } from "vitest";
import { parseWorkbookSheets } from "@/lib/bank/xlsx";
import {
  BUILDING_COLUMNS,
  planPropertyImport,
  PROPERTY_TEMPLATE,
  stateCodeOf,
  UNIT_COLUMNS,
  type ExistingProperty,
} from "../property";
import { readRows, type Sheet } from "../sheets";
import { templateWorkbook } from "../templates";

const entity = {
  id: "00000000-0000-4000-8000-0000000000e1",
  gstin: "27AAPFU0939F1ZV",
  legalName: "Orchid LLP",
};
const none: ExistingProperty = { entities: [entity], buildings: [] };

const buildingsSheet = (...rows: string[][]): Sheet => ({
  name: "Buildings",
  rows: [BUILDING_COLUMNS.map((c) => c.heading), ...rows],
});
const unitsSheet = (...rows: string[][]): Sheet => ({
  name: "Units",
  rows: [UNIT_COLUMNS.map((c) => c.heading), ...rows],
});
const orchid = [
  "Orchid Towers",
  "Plot 12, MIDC, Andheri East",
  "Mumbai",
  "Maharashtra",
  "ot",
  "",
  "",
];

describe("stateCodeOf", () => {
  it("takes a state's name in any case or its GST code", () => {
    expect(stateCodeOf("Maharashtra")).toBe("27");
    expect(stateCodeOf(" karnataka ")).toBe("29");
    expect(stateCodeOf("27")).toBe("27");
    expect(stateCodeOf("7")).toBe("07");
    expect(stateCodeOf("Bombay")).toBeNull();
    expect(stateCodeOf("99")).toBeNull();
  });
});

describe("readRows", () => {
  it("finds columns by heading in any order and case, skips blank rows, keeps Excel row numbers", () => {
    const read = readRows(
      {
        name: "Units",
        rows: [
          ["UNIT", "building name", "Carpet Area (sq ft)"],
          ["301", "Orchid Towers", "1250"],
          ["", "", ""],
          ["302", "Orchid Towers", "900"],
        ],
      },
      UNIT_COLUMNS,
    );
    expect(
      "rows" in read &&
        read.rows.map((r) => [r.row, r.values.unit, r.values.floor]),
    ).toEqual([
      [2, "301", ""],
      [4, "302", ""],
    ]);
  });

  it("names a missing required column", () => {
    const read = readRows({ name: "Units", rows: [["Unit"]] }, UNIT_COLUMNS);
    expect("error" in read && read.error.message).toBe(
      'The "Building name" column is missing. Download the template and copy your rows into it.',
    );
  });
});

describe("planPropertyImport", () => {
  it("plans new buildings, floors and units, with the forms' defaults", () => {
    const result = planPropertyImport(
      [
        buildingsSheet(orchid),
        unitsSheet(
          ["Orchid Towers", "3rd", "301", "1,250", "1625.5"],
          ["orchid towers", "", "G1", "800", ""],
        ),
      ],
      none,
    );
    if ("errors" in result) throw new Error(JSON.stringify(result.errors));
    expect(result.plan.buildings).toEqual([
      expect.objectContaining({
        name: "Orchid Towers",
        stateCode: "27",
        billingEntityId: "00000000-0000-4000-8000-0000000000e1",
        invoicePrefix: "OT",
        // Credit note prefix left blank: the invoice prefix and CN
        creditNotePrefix: "OTCN",
      }),
    ]);
    expect(result.plan.units).toEqual([
      {
        row: 2,
        building: { newKey: "new:0" },
        floor: { newLabel: "3rd" },
        code: "301",
        carpetArea: 125_000,
        chargeableArea: 162_550,
      },
      {
        row: 3,
        building: { newKey: "new:0" },
        floor: null,
        code: "G1",
        carpetArea: 80_000,
        // Billed area blank: the same as carpet area
        chargeableArea: 80_000,
      },
    ]);
  });

  it("adds units to a saved building and reuses its floor", () => {
    const result = planPropertyImport(
      [unitsSheet(["Orchid Towers", "3RD", "302", "900", ""])],
      {
        entities: [entity],
        buildings: [
          {
            id: "b1",
            name: "Orchid Towers",
            billingEntityId: "00000000-0000-4000-8000-0000000000e1",
            invoicePrefix: "OT",
            creditNotePrefix: "OTCN",
            floors: [{ id: "f3", label: "3rd" }],
            unitCodes: ["301"],
          },
        ],
      },
    );
    if ("errors" in result) throw new Error(JSON.stringify(result.errors));
    expect(result.plan.units[0]).toMatchObject({
      building: { existingId: "b1" },
      floor: { existingId: "f3" },
    });
  });

  it("lists every row to fix, by sheet and row, and saves nothing", () => {
    const result = planPropertyImport(
      [
        buildingsSheet(
          orchid,
          // Same name twice
          orchid,
          [
            "Lotus Park",
            "MG Road, Bengaluru",
            "Bengaluru",
            "Bombay",
            "LP",
            "",
            "",
          ],
          // Credit note prefix the same as Orchid's invoice prefix
          [
            "Rose Court",
            "Linking Road, Bandra",
            "Mumbai",
            "27",
            "RC",
            "OT",
            "",
          ],
        ),
        unitsSheet(
          ["Orchid Towers", "", "301", "1250", ""],
          ["Orchid Towers", "", "301", "900", ""],
          ["Nowhere House", "", "1", "100", ""],
          ["Orchid Towers", "", "302", "big", ""],
        ),
      ],
      none,
    );
    expect(
      "errors" in result &&
        result.errors.map((e) => `${e.sheet} ${e.row}: ${e.message}`),
    ).toEqual([
      "Buildings 3: Orchid Towers is in the Buildings sheet twice.",
      'Buildings 4: "Bombay" isn\'t an Indian state. Type its name, like Maharashtra, or its GST code, like 27.',
      "Buildings 5: Another building billing from this GSTIN uses OT for invoices. Choose a different credit note prefix.",
      "Units 3: Orchid Towers already has a unit 301.",
      "Units 4: There's no building called Nowhere House. Add it to the Buildings sheet, or check the spelling.",
      "Units 5: Enter the carpet area in sq ft, like 1250 or 1250.50.",
    ]);
  });

  it("asks which GSTIN when there are several, and refuses an unknown one", () => {
    const two: ExistingProperty = {
      entities: [
        entity,
        {
          id: "00000000-0000-4000-8000-0000000000e2",
          gstin: "29AAPFU0939F1ZR",
          legalName: "Orchid South",
        },
      ],
      buildings: [],
    };
    const result = planPropertyImport(
      [
        buildingsSheet(
          orchid,
          [
            "Lotus Park",
            "MG Road, Bengaluru",
            "Bengaluru",
            "29",
            "LP",
            "",
            "29aapfu0939f1zr",
          ],
          [
            "Rose Court",
            "Linking Road, Bandra",
            "Mumbai",
            "27",
            "RC",
            "",
            "27AAAAA0000A1Z5",
          ],
        ),
      ],
      two,
    );
    expect("errors" in result && result.errors.map((e) => e.row)).toEqual([
      2, 4,
    ]);
  });

  // Numbers are unique per GSTIN (BILLING_RULES section 9), so a prefix is
  // checked against every building under the same GSTIN, even one saved
  // under another billing entity carrying that GSTIN (Codex review M4).
  // Saved: Orchid Towers bills from e3 (GSTIN 27AAPFU0939F1ZV) with invoice
  // prefix OT. New: Rose Court names that GSTIN (found as e1) and wants OT
  // for credit notes, which would print OT/26-27/0001 a second time.
  it("checks prefixes against buildings under the same GSTIN on another billing entity", () => {
    const shared: ExistingProperty = {
      entities: [
        entity,
        {
          id: "00000000-0000-4000-8000-0000000000e3",
          gstin: entity.gstin,
          legalName: "Orchid LLP (second account)",
        },
      ],
      buildings: [
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          name: "Orchid Towers",
          billingEntityId: "00000000-0000-4000-8000-0000000000e3",
          invoicePrefix: "OT",
          creditNotePrefix: "OTCN",
          floors: [],
          unitCodes: [],
        },
      ],
    };
    const result = planPropertyImport(
      [
        buildingsSheet([
          "Rose Court",
          "Linking Road, Bandra",
          "Mumbai",
          "27",
          "RC",
          "OT",
          entity.gstin,
        ]),
      ],
      shared,
    );
    expect(
      "errors" in result &&
        result.errors.map((e) => `${e.sheet} ${e.row}: ${e.message}`),
    ).toEqual([
      "Buildings 2: Another building billing from this GSTIN uses OT for invoices. Choose a different credit note prefix.",
    ]);
  });

  it("refuses a file without the sheets, or with no rows", () => {
    expect(
      planPropertyImport([{ name: "Sheet1", rows: [["a"]] }], none),
    ).toMatchObject({
      errors: [{ row: 0 }],
    });
    expect(
      planPropertyImport([buildingsSheet(), unitsSheet()], none),
    ).toMatchObject({
      errors: [{ message: "The sheets have headings but no rows to import." }],
    });
  });
});

describe("the template", () => {
  it("has the instructions, then sheets with exactly the headings the import reads", () => {
    const bytes = templateWorkbook(
      PROPERTY_TEMPLATE.title,
      PROPERTY_TEMPLATE.intro,
      PROPERTY_TEMPLATE.sheets,
    );
    expect(read(bytes).SheetNames).toEqual([
      "How to fill this in",
      "Buildings",
      "Units",
    ]);
    const sheets = parseWorkbookSheets(bytes);
    // Filled in with the example rows, it imports cleanly.
    const filled = sheets.map((s) => {
      const spec = PROPERTY_TEMPLATE.sheets.find((t) => t.name === s.name);
      if (!spec) return s;
      const examples = spec.examples as readonly Record<string, string>[];
      expect(examples).toHaveLength(2);
      return {
        ...s,
        rows: [
          ...s.rows,
          ...examples.map((ex) => spec.columns.map((c) => ex[c.key] ?? "")),
        ],
      };
    });
    expect(planPropertyImport(filled, none)).toHaveProperty("plan");
    expect(
      utils.sheet_to_json(read(bytes).Sheets.Units!, { header: 1 }),
    ).toEqual([UNIT_COLUMNS.map((c) => c.heading)]);
    // Each heading carries its rule as a note.
    const units = read(bytes, { cellComments: true } as never).Sheets.Units!;
    expect(units.A1?.c?.[0]?.t).toContain("Required.");
  });
});

describe("percent cells", () => {
  it("read as typed: 5% stored as 0.05 comes back as 5%", () => {
    const sheet = utils.aoa_to_sheet([["Rent increase (%)"], [0.05], [0.125]]);
    sheet.A2!.z = "0%";
    sheet.A3!.z = "0.0%";
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, "Leases");
    const bytes = write(book, {
      type: "buffer",
      bookType: "xlsx",
    }) as Uint8Array;
    expect(parseWorkbookSheets(bytes)[0]!.rows).toEqual([
      ["Rent increase (%)"],
      ["5%"],
      ["12.50%"],
    ]);
  });
});

describe("areas with more than two decimals", () => {
  it("are refused on their row, not rounded to the hundredth", () => {
    // 1250.505 sq ft is typed with three decimals; areas are kept in
    // hundredths of a sq ft, so it can't be saved as typed. Rounding it to
    // 1250.51 would silently change the area that per sq ft rent is billed on.
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([BUILDING_COLUMNS.map((c) => c.heading), orchid]),
      "Buildings",
    );
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        UNIT_COLUMNS.map((c) => c.heading),
        ["Orchid Towers", "", "301", 1250.505, ""],
        ["Orchid Towers", "", "302", 900, 1625.255],
      ]),
      "Units",
    );
    const bytes = write(book, { type: "buffer", bookType: "xlsx" });
    const result = planPropertyImport(parseWorkbookSheets(bytes), none);
    expect(
      "errors" in result &&
        result.errors.map((e) => `${e.sheet} ${e.row}: ${e.message}`),
    ).toEqual([
      "Units 2: Enter the carpet area in sq ft, like 1250 or 1250.50.",
      "Units 3: Enter the billed area in sq ft, like 1625 or 1625.50.",
    ]);
  });
});
