// The Drizzle client. Server code only; screens go through server actions.
// Queries must be organization-scoped (db/scoped.ts, arriving in M2).

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "./url";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { leasedeskSql?: postgres.Sql };

// prepare: false so the same client works through Supabase's transaction pooler.
const sql =
  globalForDb.leasedeskSql ?? postgres(databaseUrl(), { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.leasedeskSql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });
