import { expect, test } from "@playwright/test";
import { addGstin, signUpNewOwner } from "./helpers";

test("a new owner sees the setup checklist on Today and ticks steps off", async ({
  page,
}) => {
  await signUpNewOwner(page);
  const setup = page.getByRole("region", { name: "Set up LeaseDesk" });
  await page.goto("/today");
  await expect(setup).toBeVisible();
  await expect(setup.getByText("0 of 6 done.")).toBeVisible();
  await expect(
    setup.getByRole("link", { name: "Add business details" }),
  ).toHaveAttribute("href", "/settings/business");

  await addGstin(page);
  await page.goto("/today");
  await expect(setup.getByText("1 of 6 done.")).toBeVisible();

  await setup.getByRole("button", { name: "Just me for now" }).click();
  await page.reload();
  await expect(setup.getByText("2 of 6 done.")).toBeVisible();
  await expect(
    setup.getByRole("button", { name: "Just me for now" }),
  ).toHaveCount(0);
});
