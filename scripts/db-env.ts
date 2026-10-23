// Shared setup for database scripts: load .env.local, pick the URL, refuse remote databases.

import { existsSync } from "node:fs";
import postgres from "postgres";
import {
  assertLocalDatabase,
  databaseUrl,
  isLocalDatabaseUrl,
} from "../src/lib/db/url";

export function connectForScript(): { sql: postgres.Sql; where: string } {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = databaseUrl();
  assertLocalDatabase(url);
  const where = isLocalDatabaseUrl(url) ? "local database" : "REMOTE database";
  return { sql: postgres(url, { max: 1, onnotice: () => {} }), where };
}
