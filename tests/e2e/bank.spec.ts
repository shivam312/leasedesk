import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { addGstin, signUpNewOwner } from "./helpers";

const fixture = (name: string) =>
  join(process.cwd(), "tests/fixtures/bank/synthetic", name);

test("an owner imports a bank statement; the columns are remembered", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await addGstin(page);
  await page.goto("/billing/payments");
  await page.getByRole("link", { name: "Import bank statement" }).click();

  await page.getByLabel("Whose account").selectOption({ index: 0 });
  await page.getByLabel("Bank").fill("HDFC Bank");
  await page.getByLabel("Last 4 digits of the account number").fill("1234");
  await page.getByRole("button", { name: "Add bank account" }).click();
  await expect(page.getByLabel("Bank account")).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page
    .getByLabel("Statement file")
    .setInputFiles(fixture("hdfc-like.csv"));
  await expect(page.getByLabel("Transaction date")).toHaveValue("Date");
  await expect(
    page.getByLabel("Money received (credit or deposit) (optional)"),
  ).toHaveValue("Deposit Amt.");
  await expect(
    page.getByText("3 payments received from 01-11-2026 to 05-11-2026", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import 3 payments received" })
    .click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Statement, 01-11-2026 to 05-11-2026",
  );
  await expect(
    page.getByText("Imported 3 payments received.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Not matched yet").first()).toBeVisible();

  // The same statement again, as Excel: the saved columns are used and
  // nothing is new.
  await page.goto("/billing/bank");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Statement file")
    .setInputFiles(fixture("hdfc-like.xlsx"));
  await expect(
    page.getByText(/Using this account's saved columns/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import 3 payments received" })
    .click();
  await expect(page.getByText("Nothing new in this statement.")).toBeVisible();

  // Nobody owes anything yet, so nothing is suggested; set one line aside.
  await page.goto("/billing/payments");
  await page.getByRole("link", { name: "Match payments (3)" }).click();
  await expect(page.getByText("No match found")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Record 0 payments" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Mark 1 as not rent" }).click();
  await page.getByRole("button", { name: "Set aside 1 line" }).click();
  await expect(page.getByText("Set aside 1 line as not rent.")).toBeVisible();
  await expect(page.getByText("No match found")).toHaveCount(2);
});
