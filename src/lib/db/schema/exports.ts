// Files exported for the accountant (docs/DATA_MODEL.md, Bank matching and
// exports). One row per Tally file, with the documents it carried, so a
// second export of the same invoices, credit notes or payments warns before
// they are imported twice. Append-only (drizzle/0026).

import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const exportKind = pgEnum("export_kind", ["tally_xml"]);

export const exports = pgTable(
  "exports",
  {
    id: id(),
    organizationId: uuid().notNull(),
    kind: exportKind().notNull(),
    // The dates the file covers, inclusive.
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    // Invoice, credit note and payment ids in the file.
    documentIds: uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    voucherCount: integer().notNull(),
    // A Supabase auth user; no foreign key into the auth schema (D12).
    createdBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.kind),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    check("exports_period", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("exports_voucher_count", sql`${t.voucherCount} >= 0`),
  ],
).enableRLS();
