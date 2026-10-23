import { expect, test } from "@playwright/test";
import { signUpNewOwner } from "./helpers";

test("an owner records an advance payment, then reverses it", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await page.goto("/tenants/new");
  await page.getByLabel("Tenant name").fill("Acme Software Pvt Ltd");
  await page.getByLabel("Billing address").fill("101, Andheri East, Mumbai");
  await page.getByLabel("State").selectOption("27");
  await page.getByLabel("Contact name").fill("Priya Shah");
  await page.getByLabel("Contact email (optional)").fill("accounts@acme.test");
  await page.getByRole("button", { name: "Add tenant" }).click();
  await expect(
    page.getByText("No payments yet.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Record payment" }).first().click();
  await expect(page.getByText("Nothing unpaid right now.")).toBeVisible();
  await page.getByLabel("Amount received").fill("1,08,000");
  await expect(
    page.getByText("Kept as credit for later invoices"),
  ).toBeVisible();
  await page.getByLabel("Reference (optional)").fill("UTR998877");
  await page
    .getByRole("button", { name: "Record payment of ₹1,08,000" })
    .click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Payment of ₹1,08,000",
  );
  await expect(page.getByText("Recorded ₹1,08,000 received.")).toBeVisible();

  await page.getByRole("button", { name: "Reverse this payment" }).click();
  await page.getByLabel("Why").fill("Entered against the wrong tenant");
  await page.getByRole("button", { name: "Yes, reverse it" }).click();
  await expect(page.getByText("Reversed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^A reversal on / }),
  ).toBeVisible();

  await page.getByRole("link", { name: /Acme Software/ }).click();
  await expect(
    page.getByText("Reversal", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});
