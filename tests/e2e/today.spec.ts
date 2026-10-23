import { expect, test } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import {
  addBuilding,
  addGstin,
  addLease,
  addTenant,
  addUnit,
  signUpNewOwner,
} from "./helpers";

// Today walks the owner through the month: with a lease and no invoices it
// asks for the month's invoices, then for sending them, right from the list.
test("Today: make and send the month's invoices from the list", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signUpNewOwner(page);
  await expect(page.getByText(/^No leases yet\./)).toBeVisible();

  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  const today = todayInIndia();
  await addLease(page, today);
  const month = formatMonth(today);

  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: `${month} invoices aren't made yet` }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Make ${month} invoices` }).click();
  await expect(
    page.getByRole("heading", { name: `1 ${month} invoice not sent yet` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await expect(page.getByText(`Send 1 ${month} invoice for`)).toBeVisible();
  await page.getByRole("button", { name: "Send 1 invoice" }).click();
  await expect(page.getByText(/^Sent 1 invoice/).first()).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: `1 ${month} invoice not sent yet` }),
  ).toHaveCount(0);
  // ₹1,00,000 rent + 18% GST, billed this month and not yet paid, and once
  // past its due date (depending on the day of the month) "₹1,18,000 of it
  // overdue": TDS included, as in Unpaid and ageing.
  const box = page
    .getByRole("region", { name: "This month" })
    .getByText("₹1,18,000");
  await expect(box.first()).toBeVisible();
  expect([2, 3]).toContain(await box.count());
});
