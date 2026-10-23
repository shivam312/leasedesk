import { expect, test } from "@playwright/test";
import { signUpNewOwner } from "./helpers";

test("an owner invites someone, who joins with the link", async ({
  page,
  browser,
}) => {
  await signUpNewOwner(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: /Team/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Team");

  const invitee = `accounts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("What they can do").selectOption("accounts");
  await page.getByRole("button", { name: "Create invite link" }).click();

  const link = (await page.locator("code").textContent())?.trim() ?? "";
  expect(link).toMatch(/\/invite\/[\w-]+$/);
  await expect(page.getByText("Invite not accepted yet")).toBeVisible();

  // The invitee, in their own browser.
  const context = await browser.newContext();
  const theirs = await context.newPage();
  await theirs.goto(link);
  await expect(theirs.getByRole("heading", { level: 1 })).toHaveText(
    "Join E2E Properties",
  );
  await theirs.getByLabel("Password").fill("joining-password-1");
  await theirs.getByRole("button", { name: "Join the team" }).click();
  await expect(theirs).toHaveURL("/today");

  // The link works once.
  await theirs.goto(link);
  await expect(theirs.getByRole("heading", { level: 1 })).toHaveText(
    "This invite link doesn't work any more",
  );
  await context.close();

  await page.reload();
  await expect(page.getByText(invitee)).toBeVisible();
  await expect(page.getByText("Invite not accepted yet")).toHaveCount(0);
});
