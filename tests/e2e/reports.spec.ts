import { expect, test } from "@playwright/test";
import { todayInIndia } from "../../src/lib/today";
import {
  addBuilding,
  addGstin,
  addLease,
  addTenant,
  addUnit,
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
