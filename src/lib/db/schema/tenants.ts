// Tenants and their contacts (docs/DATA_MODEL.md).
// TDS is set per charge type (D10, docs/BILLING_RULES.md section 10). The
// column defaults are those for a company tenant (tenantTdsDefaults in
// src/lib/billing/tds.ts); the tenant form turns them off for others.

import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, settings, timestamps } from "./columns";
import { organizations } from "./organizations";

const deductsTds = () => boolean().notNull().default(true);
const tdsRateBp = () => integer().notNull().default(1000);

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    companyName: text().notNull(),
    // Null for a tenant who isn't GST-registered.
    gstin: text(),
    pan: text(),
    billingAddress: text().notNull(),
    // Two-digit GST state code of the billing address.
    stateCode: text().notNull(),
    deductsTdsRent: deductsTds(),
    tdsRateBpRent: tdsRateBp(),
    deductsTdsCam: deductsTds(),
    tdsRateBpCam: tdsRateBp(),
    deductsTdsParking: deductsTds(),
    tdsRateBpParking: tdsRateBp(),
    // Utilities, signage and other charges.
    deductsTdsOther: deductsTds(),
    tdsRateBpOther: tdsRateBp(),
    settings: settings(),
    notes: text(),
    ...timestamps,
  },
  (t) => [index().on(t.organizationId), unique().on(t.organizationId, t.id)],
).enableRLS();

export const contactRole = pgEnum("contact_role", [
  "billing",
  "admin",
  "legal",
  "other",
]);

export const tenantContacts = pgTable(
  "tenant_contacts",
  {
    id: id(),
    organizationId: uuid().notNull(),
    tenantId: uuid().notNull(),
    name: text().notNull(),
    role: contactRole().notNull().default("billing"),
    email: text(),
    phone: text(),
    whatsapp: boolean().notNull().default(false),
    isPrimary: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.tenantId),
    // At most one primary contact per tenant.
    uniqueIndex("tenant_contacts_one_primary")
      .on(t.tenantId)
      .where(sql`${t.isPrimary}`),
    foreignKey({
      columns: [t.organizationId, t.tenantId],
      foreignColumns: [tenants.organizationId, tenants.id],
    }).onDelete("restrict"),
  ],
).enableRLS();
