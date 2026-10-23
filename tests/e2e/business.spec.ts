import { expect, test } from "@playwright/test";
import { signUpNewOwner } from "./helpers";

test("an owner sets business details and adds a GSTIN", async ({ page }) => {
  await signUpNewOwner(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: /Business details/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Business details",
  );

  await page.getByLabel("Legal name (optional)").fill("E2E Properties Pvt Ltd");
  await page.getByLabel("PAN (optional)").fill("aabcd1234e");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  // Stored in capitals, as it appears on the PAN card.
  await page.reload();
  await expect(page.getByLabel("PAN (optional)")).toHaveValue("AABCD1234E");

  await expect(page.getByText(/No GSTIN yet/)).toBeVisible();
  await page.getByRole("link", { name: "Add a GSTIN" }).click();
  await page
    .getByLabel("Legal name", { exact: true })
    .fill("E2E Properties Pvt Ltd");
  // A typing mistake in the last character.
  await page.getByLabel("GSTIN (optional)").fill("27AAPFU0939F1ZW");
  await page.getByLabel("State").selectOption("27");
  await page.getByLabel("Address").fill("Andheri East, Mumbai 400069");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await expect(page.getByText(/This GSTIN has a typing mistake/)).toBeVisible();

  await page.getByLabel("GSTIN (optional)").fill("27AAPFU0939F1ZV");
  await page.getByLabel("UPI ID (optional)").fill("e2e@hdfcbank");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await expect(page).toHaveURL("/settings/business");
  await expect(page.getByText("27AAPFU0939F1ZV · Maharashtra")).toBeVisible();
});
