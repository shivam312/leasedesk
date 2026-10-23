import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addMonths, monthOf, startOfMonth } from "../../src/lib/billing/dates";
import { formatINR, formatMonth } from "../../src/lib/format";
import { makeGstin } from "../../src/lib/india/identifiers";
import { todayInIndia } from "../../src/lib/today";
import { expectedDemoInvoices } from "../../src/lib/demo/expected";
import {
  walkthroughPage,
  type WalkthroughFacts,
  type WalkthroughShot,
} from "../../src/lib/demo/walkthrough-page";
import { readDemo, resetDemo } from "./demo";

// The demo walkthrough (ROADMAP M5a) on the Sharma Estates demo data: a
// month's work from logging in to the reports. `pnpm walkthrough` runs it
// against the dev server and keeps a numbered full-page screenshot of every
// step and a video (docs/walkthrough/); `pnpm test:e2e` runs it as a test,
// checking the amounts on screen against the billing engine.

const RECORD = process.env.WALKTHROUGH === "1";
const OUT = join(process.cwd(), "docs/walkthrough");

const shots: WalkthroughShot[] = [];

async function shot(page: Page, step: string, name: string) {
  if (!RECORD) return;
  // Let the page settle (fonts, client components) before the picture.
  await page.waitForLoadState("networkidle");
  const n = shots.length + 1;
  const file = `screens/${String(n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  shots.push({ n, file, step, name, width: page.viewportSize()?.width ?? 0 });
}

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

test("walkthrough: a month at Sharma Estates", async ({ browser }, info) => {
  test.skip(
    info.project.name === "phone",
    "The walkthrough resets the shared demo organization, so it runs once; it takes its own 375px pictures.",
  );
  test.setTimeout(10 * 60_000);
  const today = todayInIndia();
  const month = formatMonth(today);
  const demo = await resetDemo(today);
  if (RECORD) {
    rmSync(join(OUT, "screens"), { recursive: true, force: true });
    rmSync(join(OUT, "videos"), { recursive: true, force: true });
    mkdirSync(join(OUT, "screens"), { recursive: true });
  }
  const video = (size: { width: number; height: number }) =>
    RECORD ? { recordVideo: { dir: join(OUT, "videos", "raw"), size } } : {};
  /** Close the browser window and keep its video as videos/<name>.webm. */
  const finish = async (p: Page, name: string) => {
    await p.context().close();
    await p.video()?.saveAs(join(OUT, "videos", `${name}.webm`));
  };

  // An Indian browser: language and time zone.
  const india = { locale: "en-IN", timezoneId: "Asia/Kolkata" };
  const laptop = await browser.newContext({
    ...india,
    viewport: { width: 1280, height: 800 },
    ...video({ width: 1280, height: 800 }),
  });
  const page = await laptop.newPage();

  // 1. Log in and read Today.
  await page.goto("/login");
  await page.getByLabel("Email").fill(demo.email);
  await page.getByLabel("Password").fill(demo.password);
  await shot(page, "1", "log-in");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/today");
  await expect(
    page.getByRole("heading", { name: `${month} invoices aren't made yet` }),
  ).toBeVisible();
  await shot(page, "1", "today");

  // The same Today, and the lease list, on a phone.
  const phone = await browser.newContext({
    ...india,
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    ...video({ width: 375, height: 812 }),
  });
  const mobile = await phone.newPage();
  await mobile.goto("/login");
  await mobile.getByLabel("Email").fill(demo.email);
  await mobile.getByLabel("Password").fill(demo.password);
  await mobile.getByRole("button", { name: "Log in" }).click();
  await expect(mobile).toHaveURL("/today");
  await shot(mobile, "phone", "phone-today");
  await mobile.goto("/leases");
  await shot(mobile, "phone", "phone-leases");
  await finish(mobile, "phone");

  // 2. Open a tenant and their lease.
  await page.goto("/tenants");
  await shot(page, "2", "tenants");
  await page
    .getByRole("link", { name: "Kalinga Infotech Pvt Ltd" })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Kalinga Infotech Pvt Ltd",
  );
  await shot(page, "2", "tenant");
  await page
    .locator('a[href^="/leases/"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(visible(page, "Rent schedule")).toBeVisible();
  await shot(page, "2", "lease");

  // 3. A new tenant takes the empty office 703 from the 1st of next month.
  await page.goto("/tenants/new");
  await page.getByLabel("Tenant name").fill("Lakshya Ventures Pvt Ltd");
  await page.getByLabel("GSTIN (optional)").fill(makeGstin("06", "AABCL4321K"));
  await page
    .getByLabel("Billing address")
    .fill("Sharma Corporate Tower, Golf Course Road, Gurugram");
  await page.getByLabel("State").selectOption("06");
  await page.getByLabel("Contact name").fill("Meera Lal");
  await page
    .getByLabel("Contact email (optional)")
    .fill("accounts@lakshya.example");
  await shot(page, "3", "new-tenant");
  await page.getByRole("button", { name: "Add tenant" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Lakshya Ventures Pvt Ltd",
  );

  const start = addMonths(startOfMonth(monthOf(today)), 1, "roll_forward");
  const end = addMonths(start, 9 * 12, "roll_forward");
  await page.goto("/leases/new");
  await page
    .getByLabel("Tenant")
    .selectOption({ label: "Lakshya Ventures Pvt Ltd" });
  await page
    .getByLabel("Building")
    .selectOption({ label: "Sharma Corporate Tower" });
  await page.getByRole("checkbox", { name: /703/ }).check();
  await shot(page, "3", "new-lease-units");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Lease starts on").fill(start);
  await page.getByLabel("Last day of the lease").fill(end);
  await shot(page, "3", "new-lease-dates");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("₹ per sq ft a month").fill("125");
  await shot(page, "3", "new-lease-charges");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Check and save")).toBeVisible();
  await shot(page, "3", "new-lease-check");
  await page.getByRole("button", { name: "Save lease" }).click();
  await expect(visible(page, "Rent schedule")).toBeVisible();
  await shot(page, "3", "new-lease-saved");

  // 4. This month's billing: make, check one, explain an amount, send all.
  // Every amount is checked against the billing engine's own answer for
  // the demo leases (expectedDemoInvoices), worked out from the plan rather
  // than from what was saved.
  const expected = expectedDemoInvoices(today, monthOf(today));
  const expectedTotal = [...expected.values()].reduce(
    (s, i) => s + i.totals.grandTotal,
    0,
  );
  const sendAll = `Send ${expected.size} invoices`;
  await page.goto("/billing");
  await page.getByRole("button", { name: `Make ${month} invoices` }).click();
  await expect(
    visible(page, new RegExp(`^Made ${expected.size} invoices`)),
  ).toBeVisible({ timeout: 60_000 });
  for (const [tenant, invoice] of expected)
    await expect(
      page.getByRole("row").filter({ hasText: tenant }),
    ).toContainText(formatINR(invoice.totals.grandTotal));
  const thisMonth = startOfMonth(monthOf(today));
  const billed = await readDemo(demo.organizationId, async (q) => ({
    made: await q.monthTotal(thisMonth),
    kalinga: {
      lease: await q.lease("Kalinga Infotech Pvt Ltd"),
      invoice: await q.invoice("Kalinga Infotech Pvt Ltd", thisMonth),
    },
    newLease: await q.lease("Lakshya Ventures Pvt Ltd"),
  }));
  await shot(page, "4", "invoices-made");
  await page
    .getByRole("link", { name: /Kalinga Infotech Pvt Ltd/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForURL(/\/billing\/invoices\/[0-9a-f-]{36}$/);
  const kalinga = expected.get("Kalinga Infotech Pvt Ltd")!;
  for (const l of kalinga.lines)
    await expect(
      page.locator("details summary").filter({ hasText: l.description }),
    ).toContainText(formatINR(l.taxablePaise));
  for (const amount of [
    kalinga.totals.taxable,
    kalinga.totals.cgst,
    kalinga.totals.roundOff,
    kalinga.expectedTds.amount,
  ])
    await expect(visible(page, formatINR(amount))).toBeVisible();
  await expect(
    page.locator("details summary").filter({ hasText: /^Total/ }),
  ).toContainText(formatINR(kalinga.totals.grandTotal));
  await shot(page, "4", "draft");
  await page
    .locator("details summary")
    .filter({ visible: true })
    .first()
    .click();
  await shot(page, "4", "explain");
  await page.goto("/billing");
  await page.getByRole("button", { name: sendAll }).click();
  await expect(
    visible(
      page,
      `Send ${expected.size} ${month} invoices for ${formatINR(expectedTotal)} in all?`,
    ),
  ).toBeVisible();
  await shot(page, "4", "send-check");
  await page.getByRole("button", { name: sendAll }).click();
  await expect(page.getByRole("button", { name: sendAll })).toHaveCount(0, {
    timeout: 120_000,
  });
  await expect(page.getByRole("cell", { name: "Draft" })).toHaveCount(0);
  await shot(page, "4", "sent");

  // 5. Rangoli Media Labs pays its two oldest invoices, less 10% TDS.
  const rangoli = await readDemo(demo.organizationId, async (q) => ({
    id: await q.tenantId("Rangoli Media Labs Pvt Ltd"),
    unpaid: await q.unpaidInvoices("Rangoli Media Labs Pvt Ltd"),
  }));
  const twoOldest = rangoli.unpaid.slice(0, 2);
  // Sent months ago by the seed: still the engine's amounts for those months.
  for (const i of twoOldest) {
    const engine = expectedDemoInvoices(today, monthOf(i.invoiceDate)).get(
      "Rangoli Media Labs Pvt Ltd",
    )!;
    expect(i.grandTotal).toBe(engine.totals.grandTotal);
    expect(i.expectedTds).toBe(engine.expectedTds.amount);
  }
  const tds = twoOldest.reduce((s, i) => s + i.expectedTds, 0);
  const received = twoOldest.reduce((s, i) => s + i.grandTotal, 0) - tds;
  await page.goto(`/billing/payments/new?tenant=${rangoli.id}`);
  await page.getByLabel("Amount received").fill(formatINR(received).slice(1));
  await page.getByLabel("TDS deducted").fill(formatINR(tds).slice(1));
  await page.getByLabel("Reference (optional)").fill("UTR HDFCN52026101400123");
  for (const i of twoOldest)
    await expect(
      visible(page, `Pays ${formatINR(i.grandTotal)} (in full)`),
    ).toBeVisible();
  await shot(page, "5", "payment");
  await page
    .getByRole("button", { name: `Record payment of ${formatINR(received)}` })
    .click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);
  await shot(page, "5", "payment-recorded");

  // 6. The demo bank statement: Gulmohar's and Mysore Silk's overdue
  // invoices paid, less their TDS, and one bill paid out.
  const statement = demo.statement.credits;
  expect(statement).toHaveLength(3);
  await page.goto("/billing/bank");
  const account = page.getByLabel("Bank account");
  const hdfc = await account
    .locator("option", { hasText: "HDFC" })
    .getAttribute("value");
  await account.selectOption(hdfc!);
  await page.getByLabel("Statement file").setInputFiles({
    name: "hdfc-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(demo.statement.csv),
  });
  await expect(
    visible(page, `Import ${statement.length} payments received`),
  ).toBeVisible();
  await shot(page, "6", "bank-import");
  await page
    .getByRole("button", {
      name: `Import ${statement.length} payments received`,
    })
    .click();
  await expect(visible(page, /^Imported \d+ payments received/)).toBeVisible();
  await page.goto("/billing/bank/match");
  await shot(page, "6", "matches");
  await page
    .getByRole("button", { name: `Record ${statement.length} payments` })
    .click();
  await expect(visible(page, /^Nothing to match\./)).toBeVisible();
  await page.goto("/billing/payments");
  await shot(page, "6", "payments");

  // 7. Every report.
  await page.goto("/reports");
  await shot(page, "7", "reports");
  const reports = await page
    .locator('main a[href^="/reports/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  for (const href of [...new Set(reports)]) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "7", `report-${href.split("/").at(-1)}`);
  }
  await finish(page, "laptop");

  if (!RECORD) return;
  rmSync(join(OUT, "videos", "raw"), { recursive: true, force: true });
  const facts: WalkthroughFacts = {
    today,
    month,
    email: demo.email,
    kalinga: billed.kalinga,
    newLease: {
      unit: "703",
      area: billed.newLease.area,
      ratePaise: 12500,
      startDate: start,
    },
    made: billed.made,
    rangoli: {
      received,
      tds,
      numbers: twoOldest.map((i) => i.number ?? ""),
    },
    statement: {
      count: statement.length,
      received: statement.reduce((s, c) => s + c.amountPaise, 0),
      tenants: [...new Set(statement.map((c) => c.tenant))],
    },
  };
  writeFileSync(join(OUT, "index.html"), walkthroughPage({ facts, shots }));
  writeFileSync(
    join(OUT, "shots.json"),
    JSON.stringify({ facts, shots }, null, 2) + "\n",
  );
});
