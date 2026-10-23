// Property: buildings, floors, units (docs/DATA_MODEL.md).
// Child rows reference their parent together with organization_id, so a row
// can never point at another organization's building, floor or billing entity.

import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, settings, timestamps } from "./columns";
import { billingEntities, organizations } from "./organizations";

export const buildings = pgTable(
  "buildings",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text().notNull(),
    address: text().notNull(),
    city: text().notNull(),
    // Two-digit GST state code of the property: decides CGST + SGST or IGST (D6).
    stateCode: text().notNull(),
    billingEntityId: uuid().notNull(),
    // Setting invoice.prefix (docs/SETTINGS.md), kept as a column: every building has one.
    invoicePrefix: text().notNull(),
    creditNotePrefix: text().notNull(),
    // Building defaults (gst.defaultRateBp, gst.defaultSac, invoice.dueDays,
    // billing.defaultTiming) live here as setting overrides (D13).
    settings: settings(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.billingEntityId],
      foreignColumns: [billingEntities.organizationId, billingEntities.id],
    }).onDelete("restrict"),
  ],
).enableRLS();

export const floors = pgTable(
  "floors",
  {
    id: id(),
    organizationId: uuid().notNull(),
    buildingId: uuid().notNull(),
    label: text().notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.buildingId),
    unique().on(t.buildingId, t.label),
    unique().on(t.organizationId, t.buildingId, t.id),
    foreignKey({
      columns: [t.organizationId, t.buildingId],
      foreignColumns: [buildings.organizationId, buildings.id],
    }).onDelete("restrict"),
  ],
).enableRLS();

export const unitStatus = pgEnum("unit_status", [
  "vacant",
  "leased",
  "fit_out",
  "blocked",
]);

export const units = pgTable(
  "units",
  {
    id: id(),
    organizationId: uuid().notNull(),
    buildingId: uuid().notNull(),
    // Optional: small buildings can skip floors.
    floorId: uuid(),
    code: text().notNull(),
    // Hundredths of a sq ft: 1,250.50 sq ft is 125050.
    carpetArea: integer().notNull(),
    chargeableArea: integer().notNull(),
    status: unitStatus().notNull().default("vacant"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.buildingId),
    unique().on(t.buildingId, t.code),
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.buildingId],
      foreignColumns: [buildings.organizationId, buildings.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.buildingId, t.floorId],
      foreignColumns: [floors.organizationId, floors.buildingId, floors.id],
    }).onDelete("restrict"),
  ],
).enableRLS();
