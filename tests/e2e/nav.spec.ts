import { expect, test } from "@playwright/test";

const SECTIONS = ["Today", "Leases", "Tenants", "Billing", "Reports"];

test("main nav opens every section, and the profile icon opens Settings", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/today");

  // Only one main nav is visible at a time: bottom tabs on phones, sidebar on laptops.
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveCount(SECTIONS.length);

  for (const label of SECTIONS) {
    const link = nav.getByRole("link", { name: label });
    await link.click();
    await expect(page).toHaveURL(`/${label.toLowerCase()}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
    await expect(link).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("link", { name: "Profile and settings" }).click();
  await expect(page).toHaveURL("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
});
