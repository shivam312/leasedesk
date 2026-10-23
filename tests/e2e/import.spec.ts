import { expect, test } from "@playwright/test";
import { utils, write } from "xlsx";
import { addGstin, signUpNewOwner } from "./helpers";

/** An .xlsx file with these sheets, for setInputFiles. */
function workbook(sheets: Record<string, string[][]>) {
  const book = utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    utils.book_append_sheet(book, utils.aoa_to_sheet(rows), name);
  return {
    name: "import.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: write(book, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };
}

const BUILDINGS = [
  "Building name",
  "Address",
  "City",
  "State",
  "Invoice prefix",
  "Credit note prefix",
  "Our GSTIN",
];
const UNITS = [
  "Building name",
  "Floor",
  "Unit",
  "Carpet area (sq ft)",
  "Billed area (sq ft)",
];

test("an owner imports buildings and units from Excel, fixing a bad row first", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await addGstin(page);
  await page.goto("/leases");
  await page.getByRole("link", { name: /Import from Excel/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Import from Excel",
  );
  const template = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download the template" })
    .first()
    .click();
  expect((await template).suggestedFilename()).toBe(
    "buildings-and-units-template.xlsx",
  );

  const units = [
    UNITS,
    ["Lotus Park", "Ground", "G1", "1,200", ""],
    ["Lotus Park", "1st", "101", "big", ""],
  ];
  const building = [
    BUILDINGS,
    ["Lotus Park", "MG Road, Pune", "Pune", "Maharashtra", "LP", "", ""],
  ];
  const fileInput = page.getByLabel("Excel file (.xlsx)").first();
  await fileInput.setInputFiles(
    workbook({ Buildings: building, Units: units }),
  );
  await page
    .getByRole("button", { name: "Import buildings and units" })
    .click();
  await expect(
    page.getByText(/^Nothing was imported\. Fix this row/),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Units, row 3: Enter the carpet area in sq ft, like 1250 or 1250.50.",
    ),
  ).toBeVisible();

  units[2]![3] = "950";
  await fileInput.setInputFiles(
    workbook({ Buildings: building, Units: units }),
  );
  await page
    .getByRole("button", { name: "Import buildings and units" })
    .click();
  await expect(
    page.getByText("Imported 1 building and 2 units, with 2 new floors."),
  ).toBeVisible();

  await page.goto("/leases/buildings");
  await page
    .getByRole("link", { name: /Lotus Park/ })
    .first()
    .click();
  await expect(
    page.getByText("G1").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("101").filter({ visible: true }).first(),
  ).toBeVisible();
});
