import { expect, test } from "@playwright/test";
import { addDays } from "../../src/lib/billing/dates";
import { formatDate, formatMonth } from "../../src/lib/format";
import { statementYears } from "../../src/lib/payments/statement";
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

// The core promise end to end: a lease is entered once, the month's invoice
// is made from it, sent, and paid with TDS kept back.
test("lease → make invoices → send → record payment", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpNewOwner(page);
  await addGstin(page);
  await addBuilding(page);
  await addUnit(page);
  await addTenant(page);
  const today = todayInIndia();
  await addLease(page, today);
  // The signed agreement, kept on the lease page.
  await page.getByText("Upload a document", { exact: true }).click();
  await page
    .getByLabel("File", { exact: true })
    .filter({ visible: true })
    .setInputFiles({
      name: "Signed lease 301.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% e2e signed lease\n%%EOF\n"),
    });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Uploaded Signed lease 301.pdf.")).toBeVisible();
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("link", {
      name: /^Signed lease 301\.pdf \(opens in a new tab\)/,
    })
    .click();
  await (await opened).close();
  // A date of the landlord's own, shown on Today within its reminder.
  const review = addDays(today, 10);
  await page.getByText("Add a date", { exact: true }).click();
  await page.getByLabel("What the date is").fill("Rent review");
  await page.getByLabel("Date", { exact: true }).fill(review);
  await page.getByLabel("Remind me, days before (optional)").fill("30");
  await page.getByRole("button", { name: "Add date" }).click();
  await expect(
    page.getByText(`Added Rent review on ${formatDate(review)}.`),
  ).toBeVisible();
  const leaseUrl = page.url();
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Rent review in 10 days" }),
  ).toBeVisible();
  await page.goto(leaseUrl);
  // A phone shows the next 12 months of the schedule, then "Show all".
  if (test.info().project.name === "phone") {
    const all = page.getByText(/^Show all \d+ months$/);
    await expect(all).toBeVisible();
    await expect(page.getByText("The next 12 months.")).toBeVisible();
    await all.click();
    await expect(page.getByText(/^All \d+ months$/)).toBeVisible();
  }

  const month = formatMonth(today);
  await makeAndSendOneInvoice(page, month);
  await expect(
    page.getByText("₹1,18,000").filter({ visible: true }).first(),
  ).toBeVisible();

  await openFirstInvoice(page);
  await expect(
    page.getByText(/^E2E Tower · ET\/\d{2}-\d{2}\/0001$/),
  ).toBeVisible();
  await expect(page.getByText("Sent on", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Record payment" }).click();
  await page.getByLabel("Amount received").fill("1,08,000");
  await page.getByLabel("TDS deducted").fill("10,000");
  await expect(page.getByText("Pays ₹1,18,000 (in full)")).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment of ₹1,08,000" })
    .click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);

  await openFirstInvoice(page);
  await expect(
    page.getByText("Paid", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  // Who did what, from the activity log.
  await page.getByText(/^Activity \(\d+\)$/).click();
  await expect(page.getByText("Invoice sent", { exact: true })).toBeVisible();

  // Search finds the tenant, the unit and the invoice number.
  if (test.info().project.name === "laptop") {
    await page
      .getByRole("searchbox", { name: "Quick search" })
      .fill("0001");
    await page.keyboard.press("Enter");
  } else {
    await page.getByRole("link", { name: "Search", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search" }).fill("0001");
    await page.getByRole("button", { name: "Search" }).click();
  }
  await expect(page).toHaveURL(/\/search\?q=0001$/);
  await expect(
    page.getByRole("link", { name: /ET\/\d{2}-\d{2}\/0001/ }),
  ).toBeVisible();
  await page.goto("/search?q=301");
  await expect(page.getByRole("link", { name: /Unit 301/ })).toBeVisible();

  // The tenant's ledger for this financial year, and its statement PDF.
  await page.goto("/tenants");
  await page
    .getByRole("link", { name: "Acme Software Pvt Ltd" })
    .filter({ visible: true })
    .first()
    .click();
  // The tenant page lists the invoice, paid.
  await expect(
    page.getByRole("link", { name: /ET\/\d{2}-\d{2}\/0001/ }),
  ).toContainText("Paid");
  await page
    .locator('a[href$="/ledger"]')
    .filter({ visible: true })
    .first()
    .click();
  const fy = statementYears(today)[0]!;
  await page.getByRole("link", { name: `FY ${fy}` }).click();
  await expect(page).toHaveURL(new RegExp(`/ledger\\?fy=${fy}$`));
  await expect(page.getByText(/^Brought forward on 01-04-/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Record payment" }),
  ).toBeVisible();
  const pdf = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download statement (PDF)" }).click();
  expect((await pdf).suggestedFilename()).toBe(
    `statement-acme-software-pvt-ltd-${fy}.pdf`,
  );
});
