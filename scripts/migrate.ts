// pnpm db:migrate: apply the SQL migrations in drizzle/ (D12).

import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectForScript } from "./db-env";

const MIGRATIONS = "./drizzle";

async function main() {
  const { sql, where } = connectForScript();
  try {
    await sql`select 1`;
    if (!existsSync(`${MIGRATIONS}/meta/_journal.json`)) {
      console.info(
        `Connected to the ${where}. No migrations yet; run pnpm db:generate first.`,
      );
      return;
    }
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
    console.info(`Migrations applied to the ${where}.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
