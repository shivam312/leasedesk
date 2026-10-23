// Shared setup for database tests (*.db.test.ts). They need the local Supabase
// stack (`supabase start`, then `pnpm db:migrate`). Every test runs inside a
// transaction that is rolled back, so the database is left as it was.
// Set SKIP_DB_TESTS=1 to run only the pure unit tests on a machine without Docker.

import { sql as rawSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { assertLocalDatabase, databaseUrl } from "../url";
export { only } from "../rows";

export const skipDbTests = process.env.SKIP_DB_TESTS === "1";

function connect() {
  const url = databaseUrl();
  assertLocalDatabase(url);
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 5 });
  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) };
}

export type TestDb = ReturnType<typeof connect>["db"];
export type TestTx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

class Rollback extends Error {}

let shared: ReturnType<typeof connect> | undefined;

/** Run `fn` in a transaction that is always rolled back. */
export async function inRollback(fn: (tx: TestTx) => Promise<void>) {
  shared ??= connect();
  try {
    await shared.db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

export async function closeDb() {
  await shared?.sql.end();
  shared = undefined;
}

/** A Supabase login, inserted directly (rolled back with the test). */
export async function createAuthUser(tx: TestTx, email: string) {
  const id = crypto.randomUUID();
  await tx.execute(
    rawSql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`,
  );
  return id;
}

/**
 * Switch the rest of the transaction to Supabase's `authenticated` role, as
 * that user would be, so row-level security applies.
 */
export async function actAs(tx: TestTx, userId: string) {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  await tx.execute(
    rawSql`select set_config('request.jwt.claims', ${claims}, true)`,
  );
  await tx.execute(rawSql`set local role authenticated`);
}
