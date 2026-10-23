// Organization-scoped database access. Server code reads and writes tenant data
// only through withOrg: it runs the work in a transaction as Supabase's
// `authenticated` role with the user's id, so row-level security applies
// (drizzle/0003_rls_policies.sql), and gives helpers that add the
// organization filter explicitly, so a missing policy is not the only guard.

import { and, eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  Record<string, never>
>;

/** Anything that can open a transaction: the app's db, or a test transaction. */
export interface Transactional {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
}

export interface Scoped {
  /** Null for a background job (system scope); logged as no actor. */
  userId: string | null;
  organizationId: string;
  tx: Tx;
  /** `organization_id = <current org>`, and any further conditions. */
  where(table: { organizationId: PgColumn }, ...more: (SQL | undefined)[]): SQL;
  /** Insert values with the current organization filled in. */
  values<T extends object>(row: T): T & { organizationId: string };
}

export async function runScoped<T>(
  database: Transactional,
  ctx: OrgContext,
  fn: (scoped: Scoped) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: ctx.userId, role: "authenticated" });
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true)`,
    );
    await tx.execute(sql`set local role authenticated`);
    return fn(scopedTx(tx, ctx.userId, ctx.organizationId));
  });
}

function scopedTx(
  tx: Tx,
  userId: string | null,
  organizationId: string,
): Scoped {
  return {
    userId,
    organizationId,
    tx,
    where: (table, ...more) =>
      and(eq(table.organizationId, organizationId), ...more)!,
    values: (row) => ({ ...row, organizationId }),
  };
}

/**
 * A background job's access to one organization: no signed-in user, so it
 * runs as the database owner (row-level security doesn't apply, D14) and
 * every query still adds the organization filter. Activity is logged with no
 * actor. Only for trusted server paths: the scheduled billing run and the
 * seed script, never a screen.
 */
export async function runAsSystem<T>(
  database: Transactional,
  organizationId: string,
  fn: (scoped: Scoped) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) =>
    fn(scopedTx(tx, null, organizationId)),
  );
}

/** Run `fn` as `ctx.userId` inside `ctx.organizationId`, with row-level security on. */
export async function withOrg<T>(
  ctx: OrgContext,
  fn: (scoped: Scoped) => Promise<T>,
): Promise<T> {
  const { db } = await import("./index");
  return runScoped(db as unknown as Transactional, ctx, fn);
}
