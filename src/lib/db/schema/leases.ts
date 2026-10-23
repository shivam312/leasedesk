// Leases and the units they cover (docs/DATA_MODEL.md).
// A lease belongs to one tenant and one building. Lease units carry the
// building too, so a lease can only cover units of its own building.

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, settings, timestamps } from "./columns";
import { organizations } from "./organizations";
import { buildings, units } from "./property";
import { tenants } from "./tenants";

export const leaseStatus = pgEnum("lease_status", [
  "draft",
  "active",
  "in_notice",
  "expired",
  "terminated",
  // An earlier version, replaced by a renewal or amendment.
  "renewed",
]);

export const areaBasis = pgEnum("area_basis", ["carpet", "chargeable"]);

export const leases = pgTable(
  "leases",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    tenantId: uuid().notNull(),
    buildingId: uuid().notNull(),
    status: leaseStatus().notNull().default("draft"),
    startDate: date().notNull(),
    // Last day of the lease, inclusive.
    endDate: date().notNull(),
    lockInEndDate: date(),
    noticePeriodMonths: integer(),
    // Set months or days, not both (docs/BILLING_RULES.md section 4).
    rentFreeMonths: integer().notNull().default(0),
    rentFreeDays: integer().notNull().default(0),
    // Derived from the start date and rent-free period, stored for lists and reports.
    rentCommencementDate: date().notNull(),
    areaBasis: areaBasis().notNull().default("chargeable"),
    depositAmount: bigint({ mode: "number" }).notNull().default(0),
    version: integer().notNull().default(1),
    // The earlier version this lease renews or amends.
    replacesLeaseId: uuid(),
    // documents arrive later; no foreign key until then.
    signedDocumentId: uuid(),
    settings: settings(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.tenantId),
    index().on(t.buildingId),
    index().on(t.organizationId, t.status),
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.buildingId, t.id),
    foreignKey({
      columns: [t.organizationId, t.tenantId],
      foreignColumns: [tenants.organizationId, tenants.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.buildingId],
      foreignColumns: [buildings.organizationId, buildings.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.replacesLeaseId],
      foreignColumns: [t.organizationId, t.id],
    }).onDelete("restrict"),
    check("leases_end_after_start", sql`${t.endDate} >= ${t.startDate}`),
    check(
      "leases_rent_free_months_or_days",
      sql`${t.rentFreeMonths} >= 0 and ${t.rentFreeDays} >= 0 and (${t.rentFreeMonths} = 0 or ${t.rentFreeDays} = 0)`,
    ),
    check(
      "leases_rent_starts_in_lease",
      sql`${t.rentCommencementDate} >= ${t.startDate}`,
    ),
    check("leases_deposit_not_negative", sql`${t.depositAmount} >= 0`),
    check("leases_version_positive", sql`${t.version} >= 1`),
    check(
      "leases_notice_not_negative",
      sql`${t.noticePeriodMonths} is null or ${t.noticePeriodMonths} >= 0`,
    ),
  ],
).enableRLS();

export const leaseUnits = pgTable(
  "lease_units",
  {
    id: id(),
    organizationId: uuid().notNull(),
    leaseId: uuid().notNull(),
    buildingId: uuid().notNull(),
    unitId: uuid().notNull(),
    // Hundredths of a sq ft, copied from the unit (carpet or chargeable, per
    // the lease's area basis) so later unit edits don't change billing.
    area: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.leaseId),
    index().on(t.unitId),
    unique().on(t.leaseId, t.unitId),
    foreignKey({
      columns: [t.organizationId, t.buildingId, t.leaseId],
      foreignColumns: [leases.organizationId, leases.buildingId, leases.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.buildingId, t.unitId],
      foreignColumns: [units.organizationId, units.buildingId, units.id],
    }).onDelete("restrict"),
    check("lease_units_area_positive", sql`${t.area} > 0`),
  ],
).enableRLS();
