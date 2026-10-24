import { expect, test } from "@playwright/test";
import { addBuilding, addGstin, signUpNewOwner } from "./helpers";

test("an owner adds a building, a floor and units", async ({ page }) => {
  await signUpNewOwner(page);

  // Without a GSTIN, the add-building page explains what to do first.
  await page.goto("/leases/buildings/new");
  await expect(page.getByText(/First add the GSTIN/)).toBeVisible();

  await addGstin(page);
  await page.goto("/leases");
  await page.getByRole("link", { name: /Buildings and units/ }).click();
  await expect(page.getByText(/No buildings yet/)).toBeVisible();
  await expect(
    page
      .getByText(/No buildings yet/)
      .locator("..")
      .getByRole("link", { name: "Add building" }),
  ).toBeVisible();

  await addBuilding(page);
  await expect(page.getByText(/No units yet/)).toBeVisible();
  await expect(
    page
      .getByText(/No units yet/)
      .locator("..")
      .getByRole("link", { name: "Add unit" }),
  ).toBeVisible();

  await page.getByLabel("New floor").fill("3rd");
  await page.getByRole("button", { name: "Add floor" }).click();
  await expect(page.getByText("Added 3rd.")).toBeVisible();

  await page.getByRole("link", { name: "Add unit" }).click();
  await page.getByLabel("Unit number", { exact: true }).fill("301");
  await page
    .getByLabel("Floor", { exact: true })
    .selectOption({ label: "3rd" });
  await page.getByLabel("Carpet area (sq ft)").fill("1,250.50");
  await page.getByRole("button", { name: "Add unit" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Tower");
  await expect(
    page.getByText("1,250.50 sq ft").filter({ visible: true }).first(),
  ).toBeVisible();

  // The same unit number again is explained, not a crash.
  await page.getByRole("link", { name: "Add unit" }).click();
  await page.getByLabel("Unit number", { exact: true }).fill("301");
  await page.getByLabel("Carpet area (sq ft)").fill("900");
  await page.getByRole("button", { name: "Add unit" }).click();
  await expect(
    page.getByText("Unit 301 already exists in this building."),
  ).toBeVisible();

  await page.goto("/leases/buildings");
  await expect(
    page.getByText(/Mumbai · 1 unit, 1 vacant · 0% leased/),
  ).toBeVisible();
});
