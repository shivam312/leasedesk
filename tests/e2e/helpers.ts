import { expect, type Page } from "@playwright/test";
import { utils, write } from "xlsx";

/** A fresh account and organization for one test (the local stack doesn't confirm emails). */
export async function signUpNewOwner(page: Page) {
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  const password = "e2e-password-123";
  await page.goto("/signup");
  await page.getByLabel("Company or building name").fill("E2E Properties");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/today");
  return { email, password };
}

/** A GSTIN for the signed-in owner's business, so buildings can bill from it. */
export async function addGstin(page: Page) {
  await page.goto("/settings/business/entities/new");
  await page
    .getByLabel("Legal name", { exact: true })
    .fill("E2E Properties Pvt Ltd");
  await page.getByLabel("GSTIN (optional)").fill("27AAPFU0939F1ZV");
  await page.getByLabel("State").selectOption("27");
  await page.getByLabel("Address").fill("Andheri East, Mumbai 400069");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await expect(page).toHaveURL("/settings/business");
}

/** A building with one floor, from the Leases screens. Returns its page URL. */
export async function addBuilding(page: Page, name = "E2E Tower") {
  await page.goto("/leases/buildings/new");
  await page.getByLabel("Building name").fill(name);
  await page.getByLabel("Address").fill("Plot 12, MIDC, Andheri East");
  await page.getByLabel("City").fill("Mumbai");
  await page.getByLabel("Invoice number prefix").fill("et");
  await page.getByRole("button", { name: "Add building" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return page.url();
}

/** Floor "3rd" and unit 301 (1,000 sq ft), on the building page `addBuilding` left open. */
export async function addUnit(page: Page) {
  await page.getByLabel("New floor").fill("3rd");
  await page.getByRole("button", { name: "Add floor" }).click();
  await expect(page.getByText("Added 3rd.")).toBeVisible();
  await page.getByRole("link", { name: "Add unit" }).click();
  await page.getByLabel("Unit number", { exact: true }).fill("301");
  await page
    .getByLabel("Floor", { exact: true })
    .selectOption({ label: "3rd" });
  await page.getByLabel("Carpet area (sq ft)").fill("1,000");
  await page.getByRole("button", { name: "Add unit" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Tower");
}

/** Acme Software, in Maharashtra with a GSTIN, TDS at 10% and a billing email. */
export async function addTenant(page: Page) {
  await page.goto("/tenants/new");
  await page.getByLabel("Tenant name").fill("Acme Software Pvt Ltd");
  await page.getByLabel("GSTIN (optional)").fill("27AABCA1234B1ZH");
  await page.getByLabel("Billing address").fill("Andheri East, Mumbai");
  await page.getByLabel("State").selectOption("27");
  await page.getByLabel("Contact name").fill("Priya Shah");
  await page.getByLabel("Contact email (optional)").fill("priya@acme.example");
  await page.getByRole("button", { name: "Add tenant" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Acme Software Pvt Ltd",
  );
}

/**
 * Acme's three-year lease of unit 301 from the 1st of this month at ₹100
 * per sq ft: ₹1,00,000 a month. Leaves the lease page open.
 */
export async function addLease(page: Page, today: string) {
  const start = `${today.slice(0, 7)}-01`;
  const end = `${Number(today.slice(0, 4)) + 3}-${today.slice(5, 7)}-01`;
  await page.goto("/leases/new");
  await page
    .getByLabel("Tenant")
    .selectOption({ label: "Acme Software Pvt Ltd" });
  await page.getByLabel("Building").selectOption({ label: "E2E Tower" });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Lease starts on").fill(start);
  await page.getByLabel("Last day of the lease").fill(end);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("₹ per sq ft a month").fill("100");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Check and save")).toBeVisible();
  await page.getByRole("button", { name: "Save lease" }).click();
  await expect(page.getByText("₹1,00,000 a month")).toBeVisible();
}

/** Make `month`'s invoices (e.g. "Oct 2026") and send the one there is. */
export async function makeAndSendOneInvoice(page: Page, month: string) {
  await page.goto("/billing");
  await page.getByRole("button", { name: `Make ${month} invoices` }).click();
  await expect(
    page.getByText(`Made 1 invoice for ${month}.`, { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await expect(page.getByText(`Send 1 ${month} invoice for`)).toBeVisible();
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  // "Overdue" once this month's due date has passed (src/lib/invoices/status.ts).
  await expect(
    page
      .getByText(/^(Sent|Overdue)$/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

/** Open the first invoice in the Billing list. */
export async function openFirstInvoice(page: Page) {
  await page.goto("/billing");
  await page
    .locator('a[href^="/billing/invoices/"]')
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForURL(/\/billing\/invoices\/[0-9a-f-]{36}$/);
}

/** An .xlsx file with these sheets, for setInputFiles. */
export function workbook(sheets: Record<string, string[][]>) {
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
