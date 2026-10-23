import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/lib/db/url";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Migrations are generated here and applied by scripts/migrate.ts (D12).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  // Supabase owns auth, storage and the other schemas; we only manage public.
  schemaFilter: ["public"],
  dbCredentials: { url: databaseUrl() },
  strict: true,
  verbose: true,
});
