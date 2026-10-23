// Columns every table shares (docs/DATA_MODEL.md, db-change skill conventions).

import { jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid().primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Stored setting overrides: only values that differ from the default (docs/SETTINGS.md). */
export const settings = () =>
  jsonb().$type<Record<string, unknown>>().notNull().default({});
