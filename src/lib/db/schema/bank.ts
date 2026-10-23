// Bank accounts, the statements imported into them and their credit lines
// (docs/DATA_MODEL.md, Bank matching). The first import of an account saves
// which column is which (column_mapping), so later statements import in one
// step. Only credit lines are kept: they are the candidates for rent
// payments. The file itself isn't stored, only what was read from it.

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { ColumnMapping } from "@/lib/bank/statement";
import { id, timestamps } from "./columns";
import { billingEntities } from "./organizations";
import { tenants } from "./tenants";

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: id(),
    organizationId: uuid().notNull(),
    // The business (GSTIN) whose account it is.
    billingEntityId: uuid().notNull(),
    bankName: text().notNull(),
    accountLast4: text().notNull(),
    // Null until the first statement is imported.
    columnMapping: jsonb().$type<ColumnMapping>(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    unique().on(t.organizationId, t.id),
    unique().on(t.billingEntityId, t.bankName, t.accountLast4),
    foreignKey({
      columns: [t.organizationId, t.billingEntityId],
      foreignColumns: [billingEntities.organizationId, billingEntities.id],
    }).onDelete("restrict"),
    check("bank_accounts_last4", sql`${t.accountLast4} ~ '^[0-9]{4}$'`),
  ],
).enableRLS();

export const bankStatementImports = pgTable(
  "bank_statement_imports",
  {
    id: id(),
    organizationId: uuid().notNull(),
    bankAccountId: uuid().notNull(),
    fileName: text().notNull(),
    // First and last date of the credits read; null if there were none.
    periodStart: date(),
    periodEnd: date(),
    // Credits added, credits already imported before, debits skipped.
    lineCount: integer().notNull().default(0),
    duplicateCount: integer().notNull().default(0),
    debitCount: integer().notNull().default(0),
    importedBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.bankAccountId),
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.bankAccountId, t.id),
    foreignKey({
      columns: [t.organizationId, t.bankAccountId],
      foreignColumns: [bankAccounts.organizationId, bankAccounts.id],
    }).onDelete("restrict"),
  ],
).enableRLS();

export const matchStatus = pgEnum("match_status", [
  "unmatched",
  "suggested",
  "matched",
  "ignored",
]);

export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: id(),
    organizationId: uuid().notNull(),
    bankAccountId: uuid().notNull(),
    importId: uuid().notNull(),
    // Row in the file, from 1.
    rowNumber: integer().notNull(),
    date: date().notNull(),
    description: text().notNull(),
    reference: text(),
    creditAmount: bigint({ mode: "number" }).notNull(),
    // Date, amount, description, reference and its count in the file: the
    // same line in an overlapping statement isn't imported twice.
    fingerprint: text().notNull(),
    matchStatus: matchStatus().notNull().default("unmatched"),
    suggestedTenantId: uuid(),
    suggestedInvoiceIds: uuid().array(),
    confidence: integer(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.matchStatus),
    index().on(t.importId),
    unique().on(t.organizationId, t.id),
    unique().on(t.bankAccountId, t.fingerprint),
    foreignKey({
      columns: [t.organizationId, t.bankAccountId, t.importId],
      foreignColumns: [
        bankStatementImports.organizationId,
        bankStatementImports.bankAccountId,
        bankStatementImports.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.suggestedTenantId],
      foreignColumns: [tenants.organizationId, tenants.id],
    }).onDelete("restrict"),
    check("bank_statement_lines_credit", sql`${t.creditAmount} > 0`),
    check(
      "bank_statement_lines_confidence",
      sql`${t.confidence} is null or ${t.confidence} between 0 and 100`,
    ),
  ],
).enableRLS();
