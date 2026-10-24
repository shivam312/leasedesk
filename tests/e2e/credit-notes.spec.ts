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

// A sent credit note can't be undone, so every line starts at ₹0 and the
// total is shown, and named on the button that issues it.
test("an owner issues a part credit note from ₹0", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  const today = todayInIndia();
  await addLease(page, today);
  await makeAndSendOneInvoice(page, formatMonth(today));
  await openFirstInvoice(page);

  await page.getByRole("link", { name: "Issue a credit note" }).click();
  const rent = page.getByLabel(/^Rent for /);
  await expect(rent).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "Check the credit note" }),
  ).toBeDisabled();

  await page.getByLabel("Reason for the credit note").selectOption("discount");
  // ₹10,000 off the rent + 18% GST (₹1,800) = ₹11,800.
  await rent.fill("10000");
  await expect(page.getByText("₹11,800").first()).toBeVisible();
  await page.getByRole("button", { name: "Check the credit note" }).click();
  await expect(
    page.getByText(/^Issue a credit note for ₹11,800, dated today/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Issue credit note for ₹11,800" })
    .click();
  await expect(
    page.getByRole("link", { name: "Back to the invoice" }),
  ).toBeVisible();

  // "All of it" fills in everything left on a line.
  await page.goto(page.url().replace(/\/billing\/.*/, "/billing"));
  await openFirstInvoice(page);
  await page.getByRole("link", { name: "Issue a credit note" }).click();
  await page.getByRole("button", { name: /^All of Rent for / }).click();
  // ₹1,00,000 - ₹10,000 already credited = ₹90,000 left.
  await expect(page.getByLabel(/^Rent for /)).toHaveValue("90000");
});
