import { expect, test } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import {
  addBuilding,
  addGstin,
  addLease,
  addTenant,
  addUnit,
  makeAndSendOneInvoice,
  openFirstInvoice,
  signUpNewOwner,
} from "./helpers";

// One leased unit (301, Acme, ₹1,00,000 a month) shows on every report.
test("an owner reads the rent roll and vacancy", async ({ page }) => {
  const today = todayInIndia();
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  await addLease(page, today);

  await page.goto("/reports");
  await page.getByRole("link", { name: /Rent roll/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rent roll");
  const row = page.getByText("Acme Software Pvt Ltd").filter({ visible: true });
  await expect(row.first()).toBeVisible();
  await expect(
    page.getByText("₹1,00,000").filter({ visible: true }).first(),
  ).toBeVisible();

  // Before the lease starts, nothing is running.
  await page.getByLabel("As on").fill("2020-01-01");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(
    page.getByText("No lease is running on this date."),
  ).toBeVisible();

  // The lease ends three years from this month: listed from two years on.
  await page.goto("/reports/expiry");
  await expect(
    page.getByText("No lease ends in the 12 months from this date.").first(),
  ).toBeVisible();
  const later = `${Number(today.slice(0, 4)) + 2}-${today.slice(5, 7)}-15`;
  await page.goto(`/reports/expiry?asOf=${later}`);
  await expect(
    page.getByText("Acme Software Pvt Ltd").filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto("/reports/vacancy");
  await expect(
    page.getByText("Every unit is leased on this date."),
  ).toBeVisible();
  await page.getByLabel("As on").fill("2020-01-01");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(
    page.getByText("Never leased").filter({ visible: true }).first(),
  ).toBeVisible();
});

// A sent ₹1,18,000 invoice is unpaid until a payment settles it; the
// payment then shows in collections.
test("an owner reads unpaid rent and collections", async ({ page }) => {
  const today = todayInIndia();
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  await addLease(page, today);
  await makeAndSendOneInvoice(page, formatMonth(today));

  await page.goto("/reports");
  await page.getByRole("link", { name: /Unpaid and ageing/ }).click();
  await expect(
    page.getByText("₹1,18,000").filter({ visible: true }).first(),
  ).toBeVisible();

  await openFirstInvoice(page);
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.getByLabel("Amount received").fill("1,08,000");
  await page.getByLabel("TDS deducted").fill("10,000");
  await page
    .getByRole("button", { name: "Record payment of ₹1,08,000" })
    .click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);

  await page.goto("/reports/ageing");
  await expect(
    page.getByText("Nothing is unpaid. Every sent invoice is settled.").first(),
  ).toBeVisible();
  await page.goto(`/reports/collections?from=${today}&to=${today}`);
  await expect(
    page.getByText("₹1,08,000").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("₹10,000").filter({ visible: true }).first(),
  ).toBeVisible();

  // The invoice is ₹1,00,000 + ₹9,000 CGST + ₹9,000 SGST; ₹10,000 TDS kept back.
  await page.goto(`/reports/gst-summary?month=${today.slice(0, 7)}`);
  await expect(
    page.getByText("₹9,000").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("B2B").filter({ visible: true }).first(),
  ).toBeVisible();
  await page.goto("/reports/tds-summary");
  await expect(
    page.getByText("₹10,000").filter({ visible: true }).first(),
  ).toBeVisible();
});
