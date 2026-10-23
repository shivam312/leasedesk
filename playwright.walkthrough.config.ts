import { defineConfig, devices } from "@playwright/test";

// pnpm walkthrough: the walkthrough test (tests/e2e/walkthrough.spec.ts)
// against the dev server on port 3000, keeping its screenshots and videos
// in docs/walkthrough/. Starts `pnpm dev` if it isn't running already.
process.env.WALKTHROUGH = "1";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "walkthrough.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    // The dev server compiles each page on its first visit.
    actionTimeout: 60_000,
    navigationTimeout: 120_000,
  },
  expect: { timeout: 60_000 },
  projects: [{ name: "laptop" }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
