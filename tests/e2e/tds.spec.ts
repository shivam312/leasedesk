import { expect, test } from "@playwright/test";
import { hasTables, signUpNewOwner } from "./helpers";

test("an owner opens the TDS certificates list for the year", async ({
  page,
}) => {
  test.skip(
    !(await hasTables("tds_records", "documents")),
    "TDS tables aren't migrated yet: run pnpm db:migrate",
  );
  await signUpNewOwner(page);
  await page.goto("/billing/payments");
  await page.getByRole("link", { name: "TDS certificates" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "TDS certificates",
  );
  await expect(page.getByText(/No TDS recorded for FY/)).toBeVisible();
  // A quarter link that doesn't fit this organization says so plainly.
  await page.goto(
    "/billing/tds/upload?tenant=00000000-0000-0000-0000-000000000000&fy=2026-27&q=3",
  );
  await expect(
    page.getByText("That tenant or quarter couldn't be found."),
  ).toBeVisible();
});
