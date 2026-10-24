// The activity log (CLAUDE.md rule 7): every change records who, what, before
// and after. Writes go through insertLogged / updateLogged / deleteLogged, or
// logActivity for actions that aren't a plain row change (send, reverse, …),
// always inside the same withOrg transaction as the change itself.

import { eq, getTableName } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { activityLog } from "./schema/activity-log";
import type { Scoped } from "./scoped";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "send"
  | "reverse"
  | "invite"
  | "accept"
  | "remove"
  | "cancel_invite";

export interface ActivityEntry {
  entityType: string;
  entityId: string;
  action: ActivityAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** JSON-safe copy: bigint money becomes a string of paise, dates ISO strings. */
export function toLogJson(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (row == null) return null;
  return JSON.parse(
    JSON.stringify(row, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as Record<string, unknown>;
}

export async function logActivity(s: Scoped, entry: ActivityEntry) {
  await s.tx.insert(activityLog).values({
    organizationId: s.organizationId,
    actorUserId: s.userId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: toLogJson(entry.before),
    after: toLogJson(entry.after),
  });
}

type OrgTable = PgTable & { id: PgColumn; organizationId: PgColumn };
type Row<T extends OrgTable> = T["$inferSelect"] & {
  id: string;
  organizationId: string;
};
type NewRow<T extends OrgTable> = Omit<T["$inferInsert"], "organizationId">;

/** Insert one row into the current organization and log it as `create`. */
export async function insertLogged<T extends OrgTable>(
  s: Scoped,
  table: T,
  values: NewRow<T>,
): Promise<Row<T>> {
  const rows = (await s.tx
    .insert(table)
    .values(s.values(values) as T["$inferInsert"])
    .returning()) as Row<T>[];
  const row = rows[0];
  if (!row) throw new Error(`Nothing was added to ${getTableName(table)}`);
  await logActivity(s, {
    entityType: getTableName(table),
    entityId: row.id,
    action: "create",
    after: row,
  });
  return row;
}

/**
 * Update one row of the current organization and log before and after.
 * Returns null if the row doesn't exist, belongs to another organization, or
 * the user's role may not change it.
 */
export async function updateLogged<T extends OrgTable>(
  s: Scoped,
  table: T,
  id: string,
  patch: Partial<NewRow<T>>,
): Promise<Row<T> | null> {
  const match = s.where(table, eq(table.id, id));
  const [before] = (await s.tx
    .select()
    .from(table as PgTable)
    .where(match)
    .for("update")) as Row<T>[];
  if (!before) return null;
  const [after] = (await s.tx
    .update(table)
    .set(patch as T["$inferInsert"])
    .where(match)
    .returning()) as Row<T>[];
  if (!after) return null;
  await logActivity(s, {
    entityType: getTableName(table),
    entityId: id,
    action: "update",
    before,
    after,
  });
  return after;
}

/** Delete one row of the current organization and log what it held. Never use on financial records. */
export async function deleteLogged<T extends OrgTable>(
  s: Scoped,
  table: T,
  id: string,
): Promise<boolean> {
  const [before] = (await s.tx
    .delete(table)
    .where(s.where(table, eq(table.id, id)))
    .returning()) as Row<T>[];
  if (!before) return false;
  await logActivity(s, {
    entityType: getTableName(table),
    entityId: id,
    action: "delete",
    before,
  });
  return true;
}
