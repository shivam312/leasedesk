import { expect, test } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import { signUpNewOwner } from "./helpers";

test("an owner runs this month's billing with no leases yet", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Billing" })
    .click();
  const month = formatMonth(todayInIndia());
  await expect(page.getByText(`No invoices for ${month} yet.`)).toBeVisible();
  await page.getByRole("button", { name: `Make ${month} invoices` }).click();
  await expect(
    page.getByText(`No leases need an invoice for ${month}.`, { exact: false }),
  ).toBeVisible();
});
