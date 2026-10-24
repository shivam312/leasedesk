import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { assertLocalDatabase, databaseUrl } from "../../src/lib/db/url";
import { signUpNewOwner } from "./helpers";

/** Make the signed-up account three days old, so a missing daily run shows. */
async function ageAccount(email: string) {
  const url = databaseUrl();
  assertLocalDatabase(url);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`
      update organizations set created_at = now() - interval '3 days'
      where id = (select organization_id from memberships where email = ${email})`;
  } finally {
    await sql.end();
  }
}

test("Today warns when automatic billing is late, and Run now catches up", async ({
  page,
}) => {
  const { email } = await signUpNewOwner(page);
  await expect(
    page.getByText(/Automatic billing hasn't run since/),
  ).toHaveCount(0);
  await ageAccount(email);
  await page.reload();
  await expect(
    page.getByText(/^Automatic billing hasn't run since \d{2}-\d{2}-\d{4}$/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run now" }).click();
  // Recorded: the warning goes, and stays gone.
  await expect(
    page.getByText(/Automatic billing hasn't run since/),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(/Automatic billing hasn't run since/),
  ).toHaveCount(0);
});
