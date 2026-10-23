import { expect, test, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
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

// Every screen opens. An organization with one of everything (lease, sent
// invoice, payment, bank import) follows every link in the app once per
// route, and each page must load without an error page, a 4xx/5xx or a
// browser error. Every page.tsx under src/app/(app) must be reached, so a
// new screen is covered as soon as something links to it.

const APP = join(process.cwd(), "src/app/(app)");

/** Route patterns of the files called `name` under src/app/(app), as regexes. */
function routes(name: "page.tsx" | "route.ts"): Map<string, RegExp> {
  const found = new Map<string, RegExp>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name === name) {
        const route =
          "/" + relative(APP, dir).split(sep).filter(Boolean).join("/");
        const re = route
          .split("/")
          .map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s))
          .join("/");
        found.set(route, new RegExp(`^${re}$`));
      }
    }
  };
  walk(APP);
  return found;
}

/** Screens no link reaches on purpose, with why. Keep this short. */
const NOT_LINKED: Record<string, string> = {};

const pages = routes("page.tsx");
const files = routes("route.ts");
/** The route a path opens: like Next.js, fixed segments beat [id] ones. */
const routeOf = (path: string) =>
  [...pages]
    .filter(([, re]) => re.test(path))
    .map(([route]) => route)
    .sort((a, b) => a.split("[").length - b.split("[").length)[0];

async function setUp(page: Page) {
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
  await page.getByLabel("Amount received").fill("50,000");
  // With TDS, so the TDS page links to its certificate upload.
  await page.getByLabel("TDS deducted").fill("10,000");
  await page.getByRole("button", { name: /^Record payment of/ }).click();
  await page.waitForURL(/\/billing\/payments\/[0-9a-f-]{36}/);

  await page.goto("/billing/bank");
  await page.getByLabel("Whose account").selectOption({ index: 0 });
  await page.getByLabel("Bank").fill("HDFC Bank");
  await page.getByLabel("Last 4 digits of the account number").fill("1234");
  await page.getByRole("button", { name: "Add bank account" }).click();
  await expect(page.getByLabel("Bank account")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Statement file")
    .setInputFiles(
      join(process.cwd(), "tests/fixtures/bank/synthetic/hdfc-like.csv"),
    );
  await page.getByRole("button", { name: "Import 3 credits" }).click();
  await expect(
    page.getByText("Imported 3 credits.", { exact: false }),
  ).toBeVisible();
}

test("every screen opens without an error", async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
  });

  const queue = [
    "/today",
    "/leases",
    "/tenants",
    "/billing",
    "/reports",
    "/settings",
  ];
  const visited = new Map<string, string>(); // route → first URL opened
  const problems: string[] = [];
  while (queue.length > 0) {
    const url = queue.shift()!;
    const route = routeOf(new URL(url, "http://x").pathname);
    if (!route || visited.has(route)) continue;
    visited.set(route, url);

    const response = await page.goto(url);
    await page.waitForLoadState("networkidle");
    const status = response?.status() ?? 0;
    if (status >= 400) problems.push(`${url}: HTTP ${status}`);
    if (await page.getByText("Something went wrong").isVisible())
      problems.push(`${url}: error page`);

    for (const href of await page
      .locator('a[href^="/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
      const path = new URL(href, "http://x").pathname;
      if ([...files.values()].some((re) => re.test(path))) continue; // PDFs, downloads
      const next = routeOf(path);
      if (next && !visited.has(next)) queue.push(href);
    }
  }

  expect(problems, "pages that failed to load").toEqual([]);
  expect(errors, "browser errors").toEqual([]);
  const missed = [...pages.keys()].filter(
    (r) => !visited.has(r) && !(r in NOT_LINKED),
  );
  expect(missed, "screens no link reached").toEqual([]);
});
