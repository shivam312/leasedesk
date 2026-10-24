import { expect, test } from "@playwright/test";
import { addBuilding, addGstin, signUpNewOwner } from "./helpers";

test("the stacking plan shows floors top first, with each unit's status", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);

  await page.getByRole("link", { name: "Stacking plan" }).click();
  await expect(
    page.getByText(/No units yet, so there's nothing to draw/),
  ).toBeVisible();
  await page.goBack();

  for (const floor of ["Ground", "1st"]) {
    await page.getByLabel("New floor").fill(floor);
    await page.getByRole("button", { name: "Add floor" }).click();
    await expect(page.getByText(`Added ${floor}.`)).toBeVisible();
  }
  for (const [code, floor, area, status] of [
    ["101", "1st", "1000", "Vacant"],
    ["G01", "Ground", "3000", "Fit-out"],
  ] as const) {
    await page.getByRole("link", { name: "Add unit" }).click();
    await page.getByLabel("Unit number", { exact: true }).fill(code);
    await page
      .getByLabel("Floor (optional)", { exact: true })
      .selectOption({ label: floor });
    await page.getByLabel("Carpet area (sq ft)").fill(area);
    await page.getByLabel("Status").selectOption({ label: status });
    await page.getByRole("button", { name: "Add unit" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "E2E Tower",
    );
  }

  await page.getByRole("link", { name: "Stacking plan" }).click();
  const floors = page.getByRole("list", { name: "Floors, top floor first" });
  await expect(floors.locator(":scope > li")).toHaveCount(2);
  await expect(floors.locator(":scope > li").first()).toContainText("1st");
  await expect(page.getByRole("link", { name: /101.*Vacant/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /G01.*Fit-out/ })).toBeVisible();
  // Fit-out counts as leased (a tenant is moving in): 3,000 of 4,000 sq ft = 75%.
  await expect(
    page.getByText(
      "75% of 4,000 sq ft billed area is leased; 1,000 sq ft is vacant.",
    ),
  ).toBeVisible();
});
