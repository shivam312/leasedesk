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
  // The reminder emails and their dates, before anything is turned on.
  await expect(
    page.getByRole("heading", { name: "What payment reminders send" }),
  ).toBeVisible();
  await expect(page.getByText(/· 3 days before the due date$/)).toBeVisible();
  await page.getByText(/^See the email: Overdue: invoice/).click();
  await expect(page.getByText(/Our records show that invoice/)).toBeVisible();

  // Building defaults come before the form, so opening one never drops
  // unsaved organization rules.
  const buildingsTop = (await page
    .getByRole("heading", { name: "Building defaults" })
    .boundingBox())!.y;
  const saveTop = (await page
    .getByRole("button", { name: "Save billing rules" })
    .boundingBox())!.y;
  expect(buildingsTop).toBeLessThan(saveTop);

  const rounding = page.getByLabel("Round rent after an increase");
  await expect(rounding).toBeHidden();
  await page.getByText("More options").click();
  await expect(rounding).toHaveValue("rupee");
  await rounding.selectOption("none");
  await page.getByRole("button", { name: "Save billing rules" }).click();
  await expect(
    page.getByText(
      /Saved\. Invoices you make from now on use these rules; sent invoices don't change\./,
    ),
  ).toBeVisible();

  await page.reload();
  await page.getByText("More options").click();
  await expect(page.getByLabel("Round rent after an increase")).toHaveValue(
    "none",
  );
  await expect(page.getByText(/No buildings yet/)).toBeVisible();
});
