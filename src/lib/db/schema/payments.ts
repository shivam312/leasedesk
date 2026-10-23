// Payments, the invoices they are applied to, and the TDS each one carries
// (docs/DATA_MODEL.md, Billing; BILLING_RULES sections 10–11). Amounts are
// paise. A payment is never edited or deleted: a wrong one is reversed by a
// reversal entry (negative amounts, mirrored allocations) and recorded
// again. Database triggers (drizzle/0015) enforce this for every role.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { invoices } from "./invoices";
import { tenants } from "./tenants";

export const paymentMode = pgEnum("payment_mode", [
  "neft",
  "rtgs",
  "imps",
  "upi",
  "cheque",
  "cash",
  "other",
]);

export const paymentKind = pgEnum("payment_kind", ["payment", "reversal"]);

export const paymentStatus = pgEnum("payment_status", ["active", "reversed"]);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    organizationId: uuid().notNull(),
    tenantId: uuid().notNull(),
    // A reversal entry undoes one payment, with negative amounts.
    kind: paymentKind().notNull().default("payment"),
    receivedDate: date().notNull(),
    amountReceived: bigint({ mode: "number" }).notNull(),
    tdsDeducted: bigint({ mode: "number" }).notNull().default(0),
    mode: paymentMode().notNull(),
    reference: text(),
    note: text(),
    // The bank statement line it was matched from (M5 bank import).
    bankStatementLineId: uuid(),
    status: paymentStatus().notNull().default("active"),
    reversesPaymentId: uuid(),
    reversedByPaymentId: uuid(),
    createdBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.tenantId),
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.tenantId, t.id),
    unique().on(t.reversesPaymentId),
    foreignKey({
      columns: [t.organizationId, t.tenantId],
      foreignColumns: [tenants.organizationId, tenants.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.tenantId, t.reversesPaymentId],
      foreignColumns: [t.organizationId, t.tenantId, t.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.tenantId, t.reversedByPaymentId],
      foreignColumns: [t.organizationId, t.tenantId, t.id],
    }).onDelete("restrict"),
    check(
      "payments_amounts",
      sql`(${t.kind} = 'payment' and ${t.amountReceived} > 0 and ${t.tdsDeducted} >= 0 and ${t.reversesPaymentId} is null)
        or (${t.kind} = 'reversal' and ${t.amountReceived} < 0 and ${t.tdsDeducted} <= 0 and ${t.reversesPaymentId} is not null and ${t.status} = 'active')`,
    ),
    check(
      "payments_reversed",
      sql`(${t.status} = 'reversed') = (${t.reversedByPaymentId} is not null)`,
    ),
  ],
).enableRLS();

/**
 * How much of a payment (received + TDS) settles each invoice. Negative only
 * on a reversal entry, mirroring the payment it undoes. Append-only.
 */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: id(),
    organizationId: uuid().notNull(),
    tenantId: uuid().notNull(),
    paymentId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    // Includes the TDS share.
    amountSettled: bigint({ mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.paymentId),
    index().on(t.invoiceId),
    // The payment and the invoice are the same tenant's.
    foreignKey({
      columns: [t.organizationId, t.tenantId, t.paymentId],
      foreignColumns: [payments.organizationId, payments.tenantId, payments.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.tenantId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.tenantId, invoices.id],
    }).onDelete("restrict"),
    check("payment_allocations_not_zero", sql`${t.amountSettled} <> 0`),
  ],
).enableRLS();

/**
 * The TDS a payment carried against one invoice, tracked under a financial
 * year and quarter (`tds.quarterBasis`) until the tenant's certificate is
 * received. Only the certificate columns ever change.
 */
export const tdsRecords = pgTable(
  "tds_records",
  {
    id: id(),
    organizationId: uuid().notNull(),
    tenantId: uuid().notNull(),
    paymentId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
    // "2026-27"
    financialYear: text().notNull(),
    quarter: integer().notNull(),
    certificateReceived: boolean().notNull().default(false),
    // No foreign key until `documents` exists.
    certificateDocumentId: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.tenantId, t.financialYear, t.quarter),
    index().on(t.paymentId),
    foreignKey({
      columns: [t.organizationId, t.tenantId, t.paymentId],
      foreignColumns: [payments.organizationId, payments.tenantId, payments.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.tenantId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.tenantId, invoices.id],
    }).onDelete("restrict"),
    check("tds_records_amount_positive", sql`${t.amount} > 0`),
    check("tds_records_quarter", sql`${t.quarter} between 1 and 4`),
    check(
      "tds_records_financial_year",
      sql`${t.financialYear} ~ '^[0-9]{4}-[0-9]{2}$'`,
    ),
  ],
).enableRLS();
