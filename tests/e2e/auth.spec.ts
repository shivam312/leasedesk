import { expect, test } from "@playwright/test";
import { signUpNewOwner } from "./helpers";

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/leases");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
});

test("sign up, log out, log back in", async ({ page }) => {
  const { email, password } = await signUpNewOwner(page);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(
    page.getByText("That email and password don't match. Try again."),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email);

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/today");
});

test("sign-up explains what's wrong in plain words", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Enter your company or building name."),
  ).toBeVisible();
  await expect(
    page.getByText("Enter a valid email address, like name@company.com."),
  ).toBeVisible();
  await expect(
    page.getByText("Use at least 8 characters for your password."),
  ).toBeVisible();
});
