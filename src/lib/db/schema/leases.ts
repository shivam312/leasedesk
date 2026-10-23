// Leases and the units they cover (docs/DATA_MODEL.md).
// A lease belongs to one tenant and one building. Lease units carry the
// building too, so a lease can only cover units of its own building.

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

// Charges, rent increases and critical dates. Each references its lease
// together with organization_id; a custom increase also names the lease, so
// it can only change a charge of the same lease.

export const chargeType = pgEnum("charge_type", [
  "rent",
  "cam",
  "parking",
  "utilities",
  "signage",
  "other",
]);

export const chargeBasis = pgEnum("charge_basis", [
  "fixed",
  "per_sqft",
  "per_slot",
]);

export const chargeFrequency = pgEnum("charge_frequency", [
  "monthly",
  "quarterly",
]);

export const chargeTiming = pgEnum("charge_timing", ["advance", "arrears"]);

export const leaseCharges = pgTable(
  "lease_charges",
  {
    id: id(),
    organizationId: uuid().notNull(),
    leaseId: uuid().notNull(),
    type: chargeType().notNull(),
    basis: chargeBasis().notNull(),
    // Paise: the amount per period for `fixed`, the monthly rate per sq ft
    // for `per_sqft`, per slot for `per_slot` (docs/BILLING_RULES.md section 3).
    rateOrAmount: bigint({ mode: "number" }).notNull(),
    // Number of slots; only for `per_slot`.
    quantity: integer(),
    startDate: date().notNull(),
    endDate: date(),
    frequency: chargeFrequency().notNull().default("monthly"),
    // Timing, GST rate and SAC are copied from the building defaults when
    // the lease is saved (D16), so they're never blank here.
    timing: chargeTiming().notNull(),
    gstRateBp: integer().notNull(),
    sacCode: text().notNull(),
    waivedDuringRentFree: boolean().notNull(),
    label: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.leaseId),
    unique().on(t.organizationId, t.leaseId, t.id),
    foreignKey({
      columns: [t.organizationId, t.leaseId],
      foreignColumns: [leases.organizationId, leases.id],
    }).onDelete("restrict"),
    check("lease_charges_amount_not_negative", sql`${t.rateOrAmount} >= 0`),
    check(
      "lease_charges_slots_only_per_slot",
      sql`(${t.basis} = 'per_slot') = (${t.quantity} is not null) and (${t.quantity} is null or ${t.quantity} > 0)`,
    ),
    check(
      "lease_charges_end_after_start",
      sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`,
    ),
    check(
      "lease_charges_gst_rate",
      sql`${t.gstRateBp} >= 0 and ${t.gstRateBp} <= 10000`,
    ),
  ],
).enableRLS();

export const escalationAnchor = pgEnum("escalation_anchor", [
  "lease_start",
  "rent_commencement",
  "custom",
]);

export const escalationRules = pgTable(
  "escalation_rules",
  {
    id: id(),
    organizationId: uuid().notNull(),
    leaseId: uuid().notNull(),
    // The lease's charge ids this rule increases; null means every rent charge.
    chargeIds: uuid().array(),
    percentBp: integer().notNull(),
    everyMonths: integer().notNull(),
    anchor: escalationAnchor().notNull().default("lease_start"),
    // Only for a `custom` anchor.
    anchorDate: date(),
    compounding: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.leaseId),
    foreignKey({
      columns: [t.organizationId, t.leaseId],
      foreignColumns: [leases.organizationId, leases.id],
    }).onDelete("restrict"),
    check("escalation_rules_percent_positive", sql`${t.percentBp} > 0`),
    check("escalation_rules_every_positive", sql`${t.everyMonths} > 0`),
    check(
      "escalation_rules_anchor_date",
      sql`(${t.anchor} = 'custom') = (${t.anchorDate} is not null)`,
    ),
  ],
).enableRLS();

export const customEscalations = pgTable(
  "custom_escalations",
  {
    id: id(),
    organizationId: uuid().notNull(),
    leaseId: uuid().notNull(),
    chargeId: uuid().notNull(),
    effectiveDate: date().notNull(),
    // Exactly one of a new amount (paise, as rate_or_amount) or a percentage.
    newAmount: bigint({ mode: "number" }),
    percentBp: integer(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.leaseId),
    unique().on(t.chargeId, t.effectiveDate),
    foreignKey({
      columns: [t.organizationId, t.leaseId, t.chargeId],
      foreignColumns: [
        leaseCharges.organizationId,
        leaseCharges.leaseId,
        leaseCharges.id,
      ],
    }).onDelete("restrict"),
    check(
      "custom_escalations_amount_or_percent",
      sql`(${t.newAmount} is null) <> (${t.percentBp} is null) and (${t.newAmount} is null or ${t.newAmount} >= 0)`,
    ),
  ],
).enableRLS();

export const criticalDateType = pgEnum("critical_date_type", [
  "expiry",
  "lock_in_end",
  "escalation",
  "renewal_option",
  "notice_deadline",
  "custom",
]);

export const criticalDateStatus = pgEnum("critical_date_status", [
  "open",
  "done",
  "snoozed",
]);

export const criticalDates = pgTable(
  "critical_dates",
  {
    id: id(),
    organizationId: uuid().notNull(),
    leaseId: uuid().notNull(),
    type: criticalDateType().notNull(),
    date: date().notNull(),
    // Days before `date` to remind, e.g. {180,90,30}.
    remindDays: integer()
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    // A Supabase auth user; no foreign key into the auth schema (D12).
    assignedTo: uuid(),
    status: criticalDateStatus().notNull().default("open"),
    snoozedUntil: date(),
    // What a `custom` date is, in the user's words.
    label: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.leaseId),
    index().on(t.organizationId, t.status, t.date),
    foreignKey({
      columns: [t.organizationId, t.leaseId],
      foreignColumns: [leases.organizationId, leases.id],
    }).onDelete("restrict"),
    check(
      "critical_dates_snoozed_until",
      sql`(${t.status} = 'snoozed') = (${t.snoozedUntil} is not null)`,
    ),
    check(
      "critical_dates_custom_label",
      sql`${t.type} <> 'custom' or ${t.label} is not null`,
    ),
  ],
).enableRLS();
