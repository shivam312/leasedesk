import { expect, test } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import { addBuilding, addGstin, signUpNewOwner } from "./helpers";

// The core promise end to end: a lease is entered once, the month's invoice
// is made from it, sent, and paid with TDS kept back.
test("lease → make invoices → send → record payment", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
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

  // A lease from the 1st of this month at ₹100 per sq ft: ₹1,00,000 a month.
  const today = todayInIndia();
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

  const month = formatMonth(today);
  await page.goto("/billing");
  await page.getByRole("button", { name: `Make ${month} invoices` }).click();
  await expect(
    page.getByText(`Made 1 invoice for ${month}.`, { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("₹1,18,000").filter({ visible: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await expect(
    page.getByText(`Send 1 ${month} invoice for ₹1,18,000 in all?`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await expect(
    page.getByText("Sent", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();

  await page
    .locator('a[href^="/billing/invoices/"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByText(/^E2E Tower · ET\/\d{2}-\d{2}\/0001$/),
  ).toBeVisible();
  await expect(page.getByText("Sent on", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.getByLabel("Amount received").fill("1,08,000");
  await page.getByLabel("TDS deducted").fill("10,000");
  await expect(page.getByText("Pays ₹1,18,000 (in full)")).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment of ₹1,08,000" })
    .click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);

  await page.goto("/billing");
  await page
    .locator('a[href^="/billing/invoices/"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByText("Paid", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
});
