import { expect, test } from "@playwright/test";
import { signUpNewOwner } from "./helpers";

test("an owner changes a billing rule; advanced rules sit under More options", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: /Billing rules/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Billing rules",
  );

  const rounding = page.getByLabel("Round rent after an increase");
  await expect(rounding).toBeHidden();
  await page.getByText("More options").click();
  await expect(rounding).toHaveValue("rupee");
  await rounding.selectOption("none");
  await page.getByRole("button", { name: "Save billing rules" }).click();
  await expect(page.getByText(/Saved\. Invoices not sent yet/)).toBeVisible();

  await page.reload();
  await page.getByText("More options").click();
  await expect(page.getByLabel("Round rent after an increase")).toHaveValue(
    "none",
  );
  await expect(page.getByText(/No buildings yet/)).toBeVisible();
});
