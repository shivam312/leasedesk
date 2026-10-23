import { expect, test } from "@playwright/test";
import { formatMonth } from "../../src/lib/format";
import { todayInIndia } from "../../src/lib/today";
import {
  addBuilding,
  addGstin,
  addLease,
  addTenant,
  addUnit,
  makeAndSendOneInvoice,
  openFirstInvoice,
  signUpNewOwner,
} from "./helpers";

test("an owner opens the TDS certificates list for the year", async ({
  page,
}) => {
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

// The quarter's TDS is recorded with a payment, then the tenant's
// certificate is uploaded through Supabase Storage and the quarter shows
// as received, with the file viewable.
test("an owner uploads a TDS certificate and the quarter shows as received", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  const today = todayInIndia();
  await addLease(page, today);
  await makeAndSendOneInvoice(page, formatMonth(today));
  await openFirstInvoice(page);
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.getByLabel("Amount received").fill("1,08,000");
  await page.getByLabel("TDS deducted").fill("10,000");
  await page
    .getByRole("button", { name: "Record payment of ₹1,08,000" })
    .click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);

  await page.goto("/billing/tds");
  await expect(
    page.getByText("Not received").filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Upload certificate" })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/billing\/tds\/upload\?/);
  await expect(page.getByText(/₹10,000 TDS per your records/)).toBeVisible();
  await page.getByLabel(/TDS certificate .* file/).setInputFiles({
    name: "form16a.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  });
  await page.getByRole("button", { name: "Upload certificate" }).click();
  await expect(page.getByText(/now shows as received/)).toBeVisible();

  await page.getByRole("link", { name: "Back to TDS certificates" }).click();
  await expect(
    page.getByText("Received", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Upload certificate" }).filter({
      visible: true,
    }),
  ).toHaveCount(0);
  const view = page
    .getByRole("link", { name: "View certificate" })
    .filter({ visible: true });
  const href = await view.getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  expect((await file.body()).toString()).toContain("%PDF-1.4");
});
