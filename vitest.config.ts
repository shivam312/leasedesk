import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolve = {
  alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
};

export default defineConfig({
  resolve,
  test: {
    environment: "node",
    projects: [
      {
        resolve,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
        },
      },
      {
        // Database test files share one local Postgres. Each test holds an
        // uncommitted transaction, and some rows are unique across the whole
        // database (auth.users email: every seedOrg(tx, "A") makes
        // A-owner@example.test), so files running side by side wait on each
        // other's locks until a test times out. Run these files one at a time.
        resolve,
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
