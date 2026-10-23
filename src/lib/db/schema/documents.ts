// Uploaded files (docs/DATA_MODEL.md, Supporting): the row says what the file
// is and whose it is; the bytes live in Supabase Storage's private
// `documents` bucket under `<organization id>/...` (drizzle/0020). First
// use: TDS certificates (M5).

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const documentOwner = pgEnum("document_owner", [
  "lease",
  "tenant",
  "unit",
  "building",
]);

export const documentKind = pgEnum("document_kind", [
  "agreement",
  "addendum",
  "tds_certificate",
  "id_proof",
  "insurance",
  "other",
]);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    organizationId: uuid().notNull(),
    ownerType: documentOwner().notNull(),
    // No foreign key: it points at a row of the table ownerType names.
    ownerId: uuid().notNull(),
    kind: documentKind().notNull(),
    // Path in the `documents` bucket, starting with the organization id.
    filePath: text().notNull(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    uploadedBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.ownerType, t.ownerId),
    unique().on(t.organizationId, t.id),
    unique().on(t.filePath),
    check(
      "documents_path_in_org",
      sql`${t.filePath} like ${t.organizationId}::text || '/%'`,
    ),
    check("documents_size", sql`${t.sizeBytes} > 0`),
  ],
).enableRLS();
