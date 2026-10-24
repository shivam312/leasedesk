import { expect, test } from "@playwright/test";
import { addTenant, signUpNewOwner } from "./helpers";

test("an owner enters a tenant's opening balance; it heads the ledger and Today", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await addTenant(page);
  await expect(
    page.getByRole("heading", { name: "Opening balance" }),
  ).toBeVisible();
  await page.getByText("Add opening balance").click();
  await page.getByLabel("Amount owed (₹)").fill("2,50,000");
  await page.getByLabel("Owed as on").fill("2026-03-31");
  await page.getByRole("button", { name: "Save opening balance" }).click();
  await expect(
    page.getByText("Saved: ₹2,50,000 owed as on 31-03-2026."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/₹2,50,000 owed as on 31-03-2026, from before LeaseDesk/),
  ).toBeVisible();
  await expect(
    page.getByText("₹2,50,000 unpaid on the opening balance."),
  ).toBeVisible();

  await page.getByRole("link", { name: "See the ledger" }).click();
  await expect(
    page
      .getByText("Opening balance (owed before LeaseDesk)")
      .filter({ visible: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(
    page.getByText("Acme Software Pvt Ltd hasn't paid ₹2,50,000"),
  ).toBeVisible();
  await expect(
    page.getByText(/Includes their opening balance, owed since 31-03-2026/),
  ).toBeVisible();
});
