// Who changed what (docs/DATA_MODEL.md). Rows are only ever inserted: a
// trigger refuses updates and deletes (drizzle/0005_activity_log_rules.sql).
// Write through src/lib/db/activity-log.ts, never directly.

import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { id } from "./columns";
import { organizations } from "./organizations";

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Null for changes made by background jobs.
    actorUserId: uuid().references(() => authUsers.id, {
      onDelete: "restrict",
    }),
    // The table name, e.g. "tenants".
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    // create, update, delete, send, reverse, … (ActivityAction in activity-log.ts)
    action: text().notNull(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.organizationId, t.at),
    index().on(t.organizationId, t.entityType, t.entityId),
  ],
).enableRLS();
