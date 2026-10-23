// Invoices, their lines, credit notes and the number series behind them
// (docs/DATA_MODEL.md, Billing). Amounts are paise. A draft invoice can be
// changed or deleted; once sent, its amounts, lines and copied supplier and
// tenant details are frozen by database triggers (drizzle/0013), and
// corrections are credit notes (D4). Credit notes are never changed.

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
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Explanation } from "@/lib/billing/types";
import { id, timestamps } from "./columns";
import { chargeType, leaseCharges, leases } from "./leases";
import { billingEntities } from "./organizations";
import { buildings } from "./property";
import { tenants } from "./tenants";

export const seriesKind = pgEnum("series_kind", ["invoice", "credit_note"]);

/**
 * One numbering series per billing GSTIN, kind, financial year and prefix
 * (docs/BILLING_RULES.md section 9). Row-locked while a number is taken.
 */
export const invoiceSeries = pgTable(
  "invoice_series",
  {
    id: id(),
    organizationId: uuid().notNull(),
    billingEntityId: uuid().notNull(),
    kind: seriesKind().notNull(),
    // Short financial year, as printed in the number: "26-27".
    financialYear: text().notNull(),
    prefix: text().notNull(),
    nextNumber: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    unique().on(t.billingEntityId, t.kind, t.financialYear, t.prefix),
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.billingEntityId],
      foreignColumns: [billingEntities.organizationId, billingEntities.id],
    }).onDelete("restrict"),
    check("invoice_series_next_positive", sql`${t.nextNumber} >= 1`),
    check(
      "invoice_series_financial_year",
      sql`${t.financialYear} ~ '^[0-9]{2}-[0-9]{2}$'`,
    ),
  ],
).enableRLS();

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "part_paid",
  "paid",
  "overdue",
  "cancelled",
]);

export const supplyKind = pgEnum("supply_kind", ["intra_state", "inter_state"]);

/** The supplier's details as printed on a sent invoice (D18). */
export type SupplierCopy = {
  legalName: string;
  gstin: string | null;
  stateCode: string;
  address: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  ifsc: string | null;
  upiId: string | null;
};

/** The tenant's details as printed on a sent invoice. */
export type RecipientCopy = {
  companyName: string;
  gstin: string | null;
  billingAddress: string;
  stateCode: string;
};

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    organizationId: uuid().notNull(),
    tenantId: uuid().notNull(),
    leaseId: uuid().notNull(),
    buildingId: uuid().notNull(),
    billingEntityId: uuid().notNull(),
    // The monthly run that made it, as its first day ("2026-11-01"); one
    // invoice per lease per run, unless cancelled.
    runMonth: date().notNull(),
    // Null while draft; set with the series when sent.
    seriesId: uuid(),
    number: text(),
    invoiceDate: date().notNull(),
    dueDate: date().notNull(),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    status: invoiceStatus().notNull().default("draft"),
    // Place of supply is the building's state (BILLING_RULES section 8).
    placeOfSupply: text().notNull(),
    supplyType: supplyKind().notNull(),
    taxableTotal: bigint({ mode: "number" }).notNull(),
    cgstTotal: bigint({ mode: "number" }).notNull(),
    sgstTotal: bigint({ mode: "number" }).notNull(),
    igstTotal: bigint({ mode: "number" }).notNull(),
    roundOff: bigint({ mode: "number" }).notNull().default(0),
    grandTotal: bigint({ mode: "number" }).notNull(),
    expectedTds: bigint({ mode: "number" }).notNull().default(0),
    // Copied when sent (D18); null while draft.
    supplier: jsonb().$type<SupplierCopy>(),
    recipient: jsonb().$type<RecipientCopy>(),
    pdfPath: text(),
    sentAt: timestamp({ withTimezone: true }),
    sentTo: text().array(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.organizationId, t.status),
    index().on(t.tenantId),
    index().on(t.leaseId),
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.leaseId, t.id),
    unique().on(t.seriesId, t.number),
    uniqueIndex("invoices_one_per_lease_per_run")
      .on(t.leaseId, t.runMonth)
      .where(sql`${t.status} <> 'cancelled'`),
    foreignKey({
      columns: [t.organizationId, t.tenantId],
      foreignColumns: [tenants.organizationId, tenants.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.leaseId],
      foreignColumns: [leases.organizationId, leases.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.buildingId],
      foreignColumns: [buildings.organizationId, buildings.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.billingEntityId],
      foreignColumns: [billingEntities.organizationId, billingEntities.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.seriesId],
      foreignColumns: [invoiceSeries.organizationId, invoiceSeries.id],
    }).onDelete("restrict"),
    check(
      "invoices_period",
      sql`${t.periodEnd} >= ${t.periodStart} and ${t.dueDate} >= ${t.invoiceDate}`,
    ),
    check(
      "invoices_run_month_first_day",
      sql`extract(day from ${t.runMonth}) = 1`,
    ),
    // A draft has no number; anything sent has a number, series and copies.
    check(
      "invoices_numbered_when_sent",
      sql`(${t.status} = 'draft') = (${t.number} is null)
        and (${t.number} is null) = (${t.seriesId} is null)
        and (${t.status} = 'draft' or (${t.supplier} is not null and ${t.recipient} is not null and ${t.sentAt} is not null))`,
    ),
    check(
      "invoices_totals_add_up",
      sql`${t.grandTotal} = ${t.taxableTotal} + ${t.cgstTotal} + ${t.sgstTotal} + ${t.igstTotal} + ${t.roundOff}`,
    ),
    check(
      "invoices_amounts_not_negative",
      sql`${t.taxableTotal} >= 0 and ${t.cgstTotal} >= 0 and ${t.sgstTotal} >= 0 and ${t.igstTotal} >= 0 and ${t.expectedTds} >= 0 and ${t.grandTotal} >= 0`,
    ),
  ],
).enableRLS();

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    organizationId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    leaseId: uuid().notNull(),
    // The lease charge it bills; the lease is part of both foreign keys, so
    // it is always a charge of the invoice's lease.
    chargeId: uuid().notNull(),
    chargeType: chargeType().notNull(),
    // Order on the invoice, from 1.
    position: integer().notNull(),
    description: text().notNull(),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    // e.g. "1,250.50 sq ft × ₹85.50"; null for a fixed amount.
    quantityLabel: text(),
    sacCode: text().notNull(),
    taxableAmount: bigint({ mode: "number" }).notNull(),
    gstRateBp: integer().notNull(),
    cgst: bigint({ mode: "number" }).notNull(),
    sgst: bigint({ mode: "number" }).notNull(),
    igst: bigint({ mode: "number" }).notNull(),
    // How the amount and its tax were worked out ("Explain this amount").
    explanation: jsonb()
      .$type<{ amount: Explanation; tax: Explanation }>()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.invoiceId),
    unique().on(t.invoiceId, t.position),
    unique().on(t.organizationId, t.invoiceId, t.id),
    foreignKey({
      columns: [t.organizationId, t.leaseId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.leaseId, invoices.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.leaseId, t.chargeId],
      foreignColumns: [
        leaseCharges.organizationId,
        leaseCharges.leaseId,
        leaseCharges.id,
      ],
    }).onDelete("restrict"),
    check("invoice_lines_period", sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      "invoice_lines_amounts_not_negative",
      sql`${t.taxableAmount} >= 0 and ${t.cgst} >= 0 and ${t.sgst} >= 0 and ${t.igst} >= 0`,
    ),
    check(
      "invoice_lines_gst_rate",
      sql`${t.gstRateBp} >= 0 and ${t.gstRateBp} <= 10000`,
    ),
  ],
).enableRLS();

export const creditNoteReason = pgEnum("credit_note_reason", [
  "correction",
  "waiver",
  "discount",
  "other",
]);

/**
 * A credit note against one sent invoice (BILLING_RULES section 12). Issued
 * with its number in one step, and never changed afterwards. Amounts are
 * positive: what is taken off the invoice.
 */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    organizationId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    seriesId: uuid().notNull(),
    number: text().notNull(),
    date: date().notNull(),
    reason: creditNoteReason().notNull(),
    note: text(),
    supplyType: supplyKind().notNull(),
    taxableAmount: bigint({ mode: "number" }).notNull(),
    cgst: bigint({ mode: "number" }).notNull(),
    sgst: bigint({ mode: "number" }).notNull(),
    igst: bigint({ mode: "number" }).notNull(),
    roundOff: bigint({ mode: "number" }).notNull().default(0),
    total: bigint({ mode: "number" }).notNull(),
    pdfPath: text(),
    createdBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.invoiceId),
    unique().on(t.seriesId, t.number),
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.invoiceId, t.id),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.seriesId],
      foreignColumns: [invoiceSeries.organizationId, invoiceSeries.id],
    }).onDelete("restrict"),
    check(
      "credit_notes_total_adds_up",
      sql`${t.total} = ${t.taxableAmount} + ${t.cgst} + ${t.sgst} + ${t.igst} + ${t.roundOff}`,
    ),
    check(
      "credit_notes_amounts_not_negative",
      sql`${t.taxableAmount} >= 0 and ${t.cgst} >= 0 and ${t.sgst} >= 0 and ${t.igst} >= 0 and ${t.total} > 0`,
    ),
  ],
).enableRLS();

/** The part of each invoice line a credit note takes off. */
export const creditNoteLines = pgTable(
  "credit_note_lines",
  {
    id: id(),
    organizationId: uuid().notNull(),
    creditNoteId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    invoiceLineId: uuid().notNull(),
    description: text().notNull(),
    taxableAmount: bigint({ mode: "number" }).notNull(),
    gstRateBp: integer().notNull(),
    cgst: bigint({ mode: "number" }).notNull(),
    sgst: bigint({ mode: "number" }).notNull(),
    igst: bigint({ mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.creditNoteId),
    index().on(t.invoiceLineId),
    foreignKey({
      columns: [t.organizationId, t.invoiceId, t.creditNoteId],
      foreignColumns: [
        creditNotes.organizationId,
        creditNotes.invoiceId,
        creditNotes.id,
      ],
    }).onDelete("restrict"),
    // The line must belong to the invoice the credit note is against.
    foreignKey({
      columns: [t.organizationId, t.invoiceId, t.invoiceLineId],
      foreignColumns: [
        invoiceLines.organizationId,
        invoiceLines.invoiceId,
        invoiceLines.id,
      ],
    }).onDelete("restrict"),
    check(
      "credit_note_lines_amounts_not_negative",
      sql`${t.taxableAmount} >= 0 and ${t.cgst} >= 0 and ${t.sgst} >= 0 and ${t.igst} >= 0`,
    ),
  ],
).enableRLS();
