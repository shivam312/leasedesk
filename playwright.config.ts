import { defineConfig, devices } from "@playwright/test";

// Not 3000: a running `pnpm dev` there would be reused and tested instead of
// the production build (the phone nav test failed against a stale dev server).
const PORT = 3100;

// Every e2e test runs at phone (375px) and laptop (1280px) widths,
// the two sizes in the screen checklist (docs/UX_PRINCIPLES.md).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // A click on a page that never shows the button fails in 15s, not at the test timeout.
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "laptop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    // A production build, so tests see what ships and pages are not compiled on first visit.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/today`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
