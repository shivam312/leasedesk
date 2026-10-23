// Reads and writes for the lease screens, always through runScoped/withOrg.
// Every write is logged (insertLogged/updateLogged). Sent invoices aren't
// touched here; a lease change only affects future billing.

import { asc, desc, eq, inArray } from "drizzle-orm";
import { insertLogged, updateLogged } from "@/lib/db/activity-log";
import {
  buildings,
  criticalDates,
  customEscalations,
  escalationRules,
  leaseCharges,
  leases,
  leaseUnits,
  tenants,
  units,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { GeneratedCriticalDate } from "./critical-dates";
import type { BuiltLease } from "./draft";
import type { UnitBooking } from "./forms";
import { chargeToRow, ruleToRow, savedLeaseInput } from "./rows";

export async function listLeases(s: Scoped) {
  return s.tx
    .select({
      id: leases.id,
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      version: leases.version,
      tenantName: tenants.companyName,
      buildingName: buildings.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(buildings, eq(buildings.id, leases.buildingId))
    .where(s.where(leases))
    .orderBy(asc(tenants.companyName), desc(leases.version));
}

/** Tenants, buildings and units to choose from in the lease form. */
export async function leaseFormOptions(s: Scoped) {
  const [tenantRows, buildingRows, unitRows] = await Promise.all([
    s.tx
      .select({ id: tenants.id, name: tenants.companyName })
      .from(tenants)
      .where(s.where(tenants))
      .orderBy(asc(tenants.companyName)),
    s.tx
      .select({ id: buildings.id, name: buildings.name })
      .from(buildings)
      .where(s.where(buildings))
      .orderBy(asc(buildings.name)),
    s.tx
      .select({
        id: units.id,
        buildingId: units.buildingId,
        code: units.code,
        carpetArea: units.carpetArea,
        chargeableArea: units.chargeableArea,
      })
      .from(units)
      .where(s.where(units))
      .orderBy(asc(units.code)),
  ]);
  return { tenants: tenantRows, buildings: buildingRows, units: unitRows };
}

export async function buildingUnits(s: Scoped, buildingId: string) {
  return s.tx
    .select({
      id: units.id,
      code: units.code,
      carpetArea: units.carpetArea,
      chargeableArea: units.chargeableArea,
    })
    .from(units)
    .where(s.where(units, eq(units.buildingId, buildingId)));
}

/** Active and in-notice leases holding any of `unitIds`, for unitClashes. */
export async function unitBookings(
  s: Scoped,
  unitIds: string[],
): Promise<(UnitBooking & { unitCode: string })[]> {
  if (unitIds.length === 0) return [];
  return s.tx
    .select({
      leaseId: leases.id,
      unitId: leaseUnits.unitId,
      unitCode: units.code,
      startDate: leases.startDate,
      endDate: leases.endDate,
    })
    .from(leaseUnits)
    .innerJoin(leases, eq(leases.id, leaseUnits.leaseId))
    .innerJoin(units, eq(units.id, leaseUnits.unitId))
    .where(
      s.where(
        leaseUnits,
        inArray(leaseUnits.unitId, unitIds),
        inArray(leases.status, ["active", "in_notice"]),
      ),
    );
}

export async function getLease(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({
      lease: leases,
      tenantName: tenants.companyName,
      buildingName: buildings.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(buildings, eq(buildings.id, leases.buildingId))
    .where(s.where(leases, eq(leases.id, id)));
  if (!row) return null;
  const [unitRows, charges, rules, customs, dates] = await Promise.all([
    s.tx
      .select({
        unitId: leaseUnits.unitId,
        code: units.code,
        area: leaseUnits.area,
      })
      .from(leaseUnits)
      .innerJoin(units, eq(units.id, leaseUnits.unitId))
      .where(s.where(leaseUnits, eq(leaseUnits.leaseId, id)))
      .orderBy(asc(units.code)),
    s.tx
      .select()
      .from(leaseCharges)
      .where(s.where(leaseCharges, eq(leaseCharges.leaseId, id)))
      .orderBy(asc(leaseCharges.createdAt)),
    s.tx
      .select()
      .from(escalationRules)
      .where(s.where(escalationRules, eq(escalationRules.leaseId, id))),
    s.tx
      .select()
      .from(customEscalations)
      .where(s.where(customEscalations, eq(customEscalations.leaseId, id))),
    s.tx
      .select()
      .from(criticalDates)
      .where(s.where(criticalDates, eq(criticalDates.leaseId, id)))
      .orderBy(asc(criticalDates.date)),
  ]);
  return {
    ...row,
    units: unitRows,
    charges,
    rules,
    customs,
    criticalDates: dates,
    input: savedLeaseInput(row.lease, unitRows, charges, rules, customs),
  };
}

export type SavedLease = NonNullable<Awaited<ReturnType<typeof getLease>>>;

/**
 * Save a new lease (or a new version of one) with its units, charges,
 * rent-increase rules and critical dates. `built.lease.id` and the charge
 * ids become the rows' ids.
 */
export async function createLease(
  s: Scoped,
  built: BuiltLease,
  meta: {
    tenantId: string;
    buildingId: string;
    areaBasis: "carpet" | "chargeable";
    depositPaise: number;
    settings: Record<string, unknown>;
    status: "active" | "expired";
    version?: number;
    replacesLeaseId?: string | null;
  },
  dates: GeneratedCriticalDate[],
) {
  const { lease } = built;
  const saved = await insertLogged(s, leases, {
    id: lease.id,
    tenantId: meta.tenantId,
    buildingId: meta.buildingId,
    status: meta.status,
    startDate: lease.startDate,
    endDate: lease.endDate,
    lockInEndDate: lease.lockInEndDate,
    noticePeriodMonths: lease.noticePeriodMonths,
    rentFreeMonths: lease.rentFreeMonths ?? 0,
    rentFreeDays: lease.rentFreeDays ?? 0,
    rentCommencementDate: built.rentCommencementDate,
    areaBasis: meta.areaBasis,
    depositAmount: meta.depositPaise,
    version: meta.version ?? 1,
    replacesLeaseId: meta.replacesLeaseId ?? null,
    settings: meta.settings,
  });
  for (const u of built.unitAreas)
    await insertLogged(s, leaseUnits, {
      leaseId: saved.id,
      buildingId: meta.buildingId,
      unitId: u.unitId,
      area: u.area,
    });
  for (const c of lease.charges)
    await insertLogged(s, leaseCharges, {
      ...chargeToRow(c),
      leaseId: saved.id,
    });
  for (const r of lease.escalationRules ?? [])
    await insertLogged(s, escalationRules, {
      ...ruleToRow(r),
      leaseId: saved.id,
    });
  for (const d of dates)
    await insertLogged(s, criticalDates, {
      leaseId: saved.id,
      type: d.type,
      date: d.date,
      remindDays: d.remindDays,
    });
  return saved;
}

/** Mark the version a renewal replaces as `renewed`. */
export async function markRenewed(s: Scoped, id: string) {
  return updateLogged(s, leases, id, { status: "renewed" });
}

/** The newest version that replaces `id`, if it was renewed. */
export async function renewalOf(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({ id: leases.id })
    .from(leases)
    .where(s.where(leases, eq(leases.replacesLeaseId, id)))
    .orderBy(desc(leases.version));
  return row ?? null;
}
