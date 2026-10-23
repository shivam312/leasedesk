import { expect, type Page } from "@playwright/test";

/** A fresh account and organization for one test (the local stack doesn't confirm emails). */
export async function signUpNewOwner(page: Page) {
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  const password = "e2e-password-123";
  await page.goto("/signup");
  await page.getByLabel("Company or building name").fill("E2E Properties");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/today");
  return { email, password };
}

/** A GSTIN for the signed-in owner's business, so buildings can bill from it. */
export async function addGstin(page: Page) {
  await page.goto("/settings/business/entities/new");
  await page
    .getByLabel("Legal name", { exact: true })
    .fill("E2E Properties Pvt Ltd");
  await page.getByLabel("GSTIN (optional)").fill("27AAPFU0939F1ZV");
  await page.getByLabel("State").selectOption("27");
  await page.getByLabel("Address").fill("Andheri East, Mumbai 400069");
  await page.getByRole("button", { name: "Add GSTIN" }).click();
  await expect(page).toHaveURL("/settings/business");
}

/** A building with one floor, from the Leases screens. Returns its page URL. */
export async function addBuilding(page: Page, name = "E2E Tower") {
  await page.goto("/leases/buildings/new");
  await page.getByLabel("Building name").fill(name);
  await page.getByLabel("Address").fill("Plot 12, MIDC, Andheri East");
  await page.getByLabel("City").fill("Mumbai");
  await page.getByLabel("Invoice number prefix").fill("et");
  await page.getByRole("button", { name: "Add building" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return page.url();
}
