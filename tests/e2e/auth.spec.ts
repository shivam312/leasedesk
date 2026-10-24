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

/** The newest email to `to` in the local stack's Mailpit, as plain text. */
async function latestEmailText(to: string): Promise<string> {
  const mailpit = "http://127.0.0.1:54324/api/v1";
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `${mailpit}/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length > 0) {
      const msg = await fetch(`${mailpit}/message/${messages[0]!.ID}`);
      const body = (await msg.json()) as { Text: string; HTML: string };
      return body.Text || body.HTML;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to}`);
}

test("forgot password: the emailed link lets you choose a new one", async ({
  page,
}) => {
  const { email } = await signUpNewOwner(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();

  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Forgot your password?",
  );
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(
    page.getByText(`If ${email} has an account, we've emailed it`, {
      exact: false,
    }),
  ).toBeVisible();

  const text = await latestEmailText(email);
  const link = text.match(/https?:\/\/[^\s"<>)]+verify[^\s"<>)]+/)?.[0];
  expect(link, "reset link in the email").toBeTruthy();
  await page.goto(link!.replaceAll("&amp;", "&"));
  await expect(page).toHaveURL("/reset-password");

  await page.getByLabel("New password").fill("new-password-456");
  await page.getByLabel("Type it again").fill("new-password-45");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByText("The two passwords don't match. Type the same one twice."),
  ).toBeVisible();
  await page.getByLabel("New password").fill("new-password-456");
  await page.getByLabel("Type it again").fill("new-password-456");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL("/today");

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("new-password-456");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/today");
});

test("an expired reset link says so and offers a new one", async ({ page }) => {
  await page.goto("/auth/confirm?code=not-a-real-code&next=/reset-password");
  await expect(page).toHaveURL("/forgot-password?expired=1");
  await expect(
    page.getByText("That link has expired or was already used."),
  ).toBeVisible();
});

test("a reset page left open after the session ended explains why", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await page.goto("/reset-password");
  await page.context().clearCookies();
  await page.getByLabel("New password").fill("new-password-456");
  await page.getByLabel("Type it again").fill("new-password-456");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL("/forgot-password?expired=1");
  await expect(
    page.getByText("That link has expired or was already used."),
  ).toBeVisible();
});

// The local Supabase stack has no Google provider, so no Google button.
test("Log in with Google shows only when Google login is turned on", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log in with Google" }),
  ).toHaveCount(0);
  await page.goto("/signup");
  await expect(
    page.getByRole("button", { name: "Sign up with Google" }),
  ).toHaveCount(0);
});
