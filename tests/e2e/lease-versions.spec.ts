import { expect, test } from "@playwright/test";
import { formatDate } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import {
  addBuilding,
  addGstin,
  addLease,
  addTenant,
  addUnit,
  signUpNewOwner,
} from "./helpers";

// A lease's later life: renewed as a new version (the old one is kept and
// marked renewed), then the new version ended early.
test("renew a lease, then end the new version early", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  const today = todayInIndia();
  await addLease(page, today);
  const firstVersion = page.url();

  // addLease's lease runs to the 1st of this month three years on, so the
  // renewal starts the next day.
  const year = Number(today.slice(0, 4));
  const month = today.slice(5, 7);
  const renewalStart = `${year + 3}-${month}-02`;
  await page.getByRole("link", { name: "Renew" }).click();
  await page.waitForURL(/\/leases\/new\?renew=/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Lease starts on")).toHaveValue(renewalStart);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Check and save")).toBeVisible();
  await page.getByRole("button", { name: "Save lease" }).click();
  await expect(page.getByText(/· Version 2$/)).toBeVisible();
  await expect(
    page.getByText(`E2E Tower · ${formatDate(renewalStart)} to`, {
      exact: false,
    }),
  ).toBeVisible();

  const secondVersion = page.url();
  expect(secondVersion).not.toBe(firstVersion);
  await page.goto(firstVersion);
  await expect(
    page.getByText("Renewed", { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  // End version 2 a year into it.
  const exitDate = `${year + 4}-${month}-01`;
  await page.goto(secondVersion);
  await page.getByText("End this lease early").click();
  await page.getByLabel("Tenant's last day").fill(exitDate);
  await page.getByRole("button", { name: "End lease on this day" }).click();
  await page.getByRole("button", { name: "End lease", exact: true }).click();
  await expect(
    page.getByText(`The lease now ends on ${formatDate(exitDate)}.`, {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`${formatDate(renewalStart)} to ${formatDate(exitDate)}`, {
      exact: false,
    }),
  ).toBeVisible();
});
