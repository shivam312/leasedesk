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
