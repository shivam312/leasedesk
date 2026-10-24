import { expect, test } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { statementYears } from "../../src/lib/payments/statement";
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

// The core promise end to end: a lease is entered once, the month's invoice
// is made from it, sent, and paid with TDS kept back.
test("lease → make invoices → send → record payment", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  const today = todayInIndia();
  await addLease(page, today);
  // A phone shows the next 12 months of the schedule, then "Show all".
  if (test.info().project.name === "phone") {
    const all = page.getByText(/^Show all \d+ months$/);
    await expect(all).toBeVisible();
    await expect(page.getByText("The next 12 months.")).toBeVisible();
    await all.click();
    await expect(page.getByText(/^All \d+ months$/)).toBeVisible();
  }

  const month = formatMonth(today);
  await makeAndSendOneInvoice(page, month);
  await expect(
    page.getByText("₹1,18,000").filter({ visible: true }).first(),
  ).toBeVisible();

  await openFirstInvoice(page);
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

  await openFirstInvoice(page);
  await expect(
    page.getByText("Paid", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();

  // The tenant's ledger for this financial year, and its statement PDF.
  await page.goto("/tenants");
  await page
    .getByRole("link", { name: "Acme Software Pvt Ltd" })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .locator('a[href$="/ledger"]')
    .filter({ visible: true })
    .first()
    .click();
  const fy = statementYears(today)[0]!;
  await page.getByRole("link", { name: `FY ${fy}` }).click();
  await expect(page).toHaveURL(new RegExp(`/ledger\\?fy=${fy}$`));
  await expect(page.getByText(/^Brought forward on 01-04-/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Record payment" }),
  ).toBeVisible();
  const pdf = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download statement (PDF)" }).click();
  expect((await pdf).suggestedFilename()).toBe(
    `statement-acme-software-pvt-ltd-${fy}.pdf`,
  );
});
