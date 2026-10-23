// The daily digest email (docs/DATA_MODEL.md, Supporting). One row per
// person per day, claimed before the email goes, so a retried or doubled
// daily job never sends anyone two digests on the same day. Rows are never
// deleted; the only change is the status, once, from "sending" (drizzle/0024).

import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const digestStatus = pgEnum("digest_status", [
  // Claimed; the email is going out. Stays so if the send never finished,
  // which is safer than sending twice.
  "sending",
  "sent",
  "failed",
]);

export const digestSends = pgTable(
  "digest_sends",
  {
    id: id(),
    organizationId: uuid().notNull(),
    // A Supabase auth user; no foreign key into the auth schema (D12).
    userId: uuid().notNull(),
    // The India date the digest is for.
    digestDate: date().notNull(),
    sentTo: text().notNull(),
    itemCount: integer().notNull(),
    status: digestStatus().notNull().default("sending"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    uniqueIndex("digest_sends_one_per_day").on(
      t.organizationId,
      t.userId,
      t.digestDate,
    ),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    check("digest_sends_items", sql`${t.itemCount} > 0`),
  ],
).enableRLS();
