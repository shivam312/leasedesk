import { expect, test, type Page } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import { addGstin, signUpNewOwner, workbook } from "./helpers";

const visible = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).filter({ visible: true }).first();

// A landlord's first month, start to finish: sign up, bring the building,
// tenants and leases in from Excel, make and send the month's invoices,
// record one tenant's payment, then read the reports.
//
// Two leases from the 1st of this month, both at ₹100 per sq ft:
// - Beta Foods, G1, 1,000 sq ft: ₹1,00,000 + ₹9,000 CGST + ₹9,000 SGST
//   = ₹1,18,000; deducts 10% TDS (₹10,000), so pays ₹1,08,000.
// - Gamma Studio, 101, 500 sq ft: ₹50,000 + ₹4,500 + ₹4,500 = ₹59,000;
//   no TDS; doesn't pay this month.
test("new landlord → import → billing run → send → payment → reports", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const today = todayInIndia();
  const month = formatMonth(today);
  const [y, m] = [today.slice(0, 4), today.slice(5, 7)];
  const start = `01-${m}-${y}`;
  const end = `01-${m}-${Number(y) + 3}`;

  // 1. A new organization with one GSTIN.
  await signUpNewOwner(page);
  await addGstin(page);

  // 2. Import the building and units, then tenants and leases.
  await page.goto("/leases/import");
  const file = page.getByLabel("Excel file (.xlsx)");
  await file.first().setInputFiles(
    workbook({
      Buildings: [
        [
          "Building name",
          "Address",
          "City",
          "State",
          "Invoice prefix",
          "Credit note prefix",
          "Our GSTIN",
        ],
        ["Lotus Park", "MG Road, Pune", "Pune", "27", "LP", "", ""],
      ],
      Units: [
        ["Building name", "Floor", "Unit", "Carpet area (sq ft)"],
        ["Lotus Park", "Ground", "G1", "1000"],
        ["Lotus Park", "1st", "101", "500"],
      ],
    }),
  );
  await page
    .getByRole("button", { name: "Import buildings and units" })
    .click();
  await expect(
    page.getByText("Imported 1 building and 2 units, with 2 new floors."),
  ).toBeVisible();

  await file.nth(1).setInputFiles(
    workbook({
      Tenants: [
        [
          "Tenant name",
          "GSTIN",
          "Billing address",
          "State",
          "Contact name",
          "Contact email",
          "Deducts TDS",
        ],
        [
          "Beta Foods LLP",
          "27AABCA1234B1ZH",
          "Lower Parel, Mumbai",
          "",
          "Ravi",
          "ravi@beta.example",
          "Yes",
        ],
        [
          "Gamma Studio",
          "",
          "Baner, Pune",
          "Maharashtra",
          "Meera",
          "meera@gamma.example",
          "No",
        ],
      ],
      Leases: [
        [
          "Tenant name",
          "Building name",
          "Units",
          "Lease starts",
          "Last day",
          "Rent at lease start (₹)",
        ],
        ["Beta Foods LLP", "Lotus Park", "G1", start, end, "100"],
        ["Gamma Studio", "Lotus Park", "101", start, end, "100"],
      ],
    }),
  );
  await page.getByRole("button", { name: "Import tenants and leases" }).click();
  await expect(
    page.getByText(/^Imported 2 tenants and 2 leases\./),
  ).toBeVisible();

  // 3. The billing run makes both invoices; one goes by Send selected, the other by Send all.
  await page.goto("/billing");
  await page.getByRole("button", { name: `Make ${month} invoices` }).click();
  await expect(
    page.getByText(`Made 2 invoices for ${month}.`, { exact: false }),
  ).toBeVisible();
  // Search, tick Gamma's and send just that one first.
  await page.getByLabel("Search invoices").fill("gamma");
  await expect(visible(page, "Beta Foods LLP")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Select Gamma Studio" })
    .filter({ visible: true })
    .check();
  await page.getByRole("button", { name: "Send 1 selected invoice" }).click();
  await expect(
    page.getByText(`Send 1 selected ${month} invoice for`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  // Gamma's is sent (the list still shows only Gamma).
  await expect(
    page.getByText(/^(Sent|Overdue)$/).filter({ visible: true }),
  ).toHaveCount(1);
  // Then the rest with Send all.
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await expect(page.getByText(`Send 1 ${month} invoice for`)).toBeVisible();
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await page.getByLabel("Search invoices").fill("");
  // "Overdue" once this month's due date has passed.
  await expect(
    page.getByText(/^(Sent|Overdue)$/).filter({ visible: true }),
  ).toHaveCount(2);
  await expect(visible(page, "₹1,18,000")).toBeVisible();
  await expect(visible(page, "₹59,000")).toBeVisible();

  // 4. Beta pays ₹1,08,000 and keeps ₹10,000 back as TDS.
  await page
    .locator('a[href^="/billing/invoices/"]')
    .filter({ hasText: "Beta Foods LLP", visible: true })
    .first()
    .click();
  await expect(
    page.getByText(/^Lotus Park · LP\/\d{2}-\d{2}\/000[12]$/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.getByLabel("Amount received").fill("1,08,000");
  await page.getByLabel("TDS deducted").fill("10,000");
  await expect(page.getByText("Pays ₹1,18,000 (in full)")).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment of ₹1,08,000" })
    .click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);

  // 5. The reports agree with what happened.
  await page.goto(`/reports/rent-roll?asOf=${today}`);
  await expect(visible(page, "Beta Foods LLP")).toBeVisible();
  await expect(visible(page, "Gamma Studio")).toBeVisible();
  await expect(visible(page, "₹1,50,000")).toBeVisible();

  await page.goto("/reports/ageing");
  await expect(visible(page, "Gamma Studio")).toBeVisible();
  await expect(visible(page, "₹59,000")).toBeVisible();
  await expect(
    page.getByText("Beta Foods LLP").filter({ visible: true }),
  ).toHaveCount(0);

  await page.goto(`/reports/collections?from=${today}&to=${today}`);
  await expect(visible(page, "₹1,08,000")).toBeVisible();
  await expect(visible(page, "₹10,000")).toBeVisible();

  await page.goto(`/reports/gst-summary?month=${today.slice(0, 7)}`);
  await expect(visible(page, "₹9,000")).toBeVisible();
  await expect(visible(page, "₹4,500")).toBeVisible();

  await page.goto("/reports/tds-summary");
  await expect(visible(page, "₹10,000")).toBeVisible();

  // Today shows the month at a glance: billed ₹1,77,000, collected ₹1,08,000
  // in money plus ₹10,000 TDS kept back (together they settle Beta's invoice).
  await page.goto("/today");
  await expect(visible(page, "₹1,77,000")).toBeVisible();
  await expect(visible(page, "₹1,08,000")).toBeVisible();
  await expect(visible(page, "Plus ₹10,000 TDS kept back")).toBeVisible();
});
