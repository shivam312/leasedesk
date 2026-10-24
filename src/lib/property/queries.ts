// Reads for the buildings and units screens, always through withOrg/runScoped.

import { asc, eq, ne } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import {
  billingEntities,
  buildings,
  floors,
  leases,
  leaseUnits,
  units,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { leasedUnitIds, occupancyOf } from "@/lib/reports/vacancy";

/**
 * Every building with its occupancy on `today`, counted from running leases
 * the way the Vacancy report counts it (not from units' marked status).
 */
export async function listBuildings(s: Scoped, today: PlainDate) {
  const [list, unitRows, leaseRows] = await Promise.all([
    s.tx
      .select({ id: buildings.id, name: buildings.name, city: buildings.city })
      .from(buildings)
      .where(s.where(buildings))
      .orderBy(asc(buildings.name)),
    s.tx
      .select({
        id: units.id,
        buildingId: units.buildingId,
        area: units.chargeableArea,
        status: units.status,
      })
      .from(units)
      .where(s.where(units)),
    s.tx
      .select({
        unitId: leaseUnits.unitId,
        status: leases.status,
        startDate: leases.startDate,
        endDate: leases.endDate,
      })
      .from(leaseUnits)
      .innerJoin(leases, eq(leases.id, leaseUnits.leaseId))
      .where(s.where(leaseUnits, ne(leases.status, "draft"))),
  ]);
  const leased = leasedUnitIds(leaseRows, today);
  return list.map((b) => ({
    ...b,
    ...occupancyOf(
      unitRows.filter((u) => u.buildingId === b.id),
      leased,
    ),
  }));
}

export async function getBuilding(s: Scoped, id: string) {
  const [building] = await s.tx
    .select()
    .from(buildings)
    .where(s.where(buildings, eq(buildings.id, id)));
  if (!building) return null;
  const [floorList, unitList] = await Promise.all([
    s.tx
      .select()
      .from(floors)
      .where(s.where(floors, eq(floors.buildingId, id)))
      .orderBy(asc(floors.sortOrder), asc(floors.label)),
    s.tx
      .select()
      .from(units)
      .where(s.where(units, eq(units.buildingId, id)))
      .orderBy(asc(units.code)),
  ]);
  return { building, floors: floorList, units: unitList };
}

export async function billingEntityOptions(s: Scoped) {
  return s.tx
    .select({
      id: billingEntities.id,
      legalName: billingEntities.legalName,
      gstin: billingEntities.gstin,
      stateCode: billingEntities.stateCode,
    })
    .from(billingEntities)
    .where(s.where(billingEntities))
    .orderBy(asc(billingEntities.createdAt));
}

/**
 * The billing entities sharing this one's GSTIN, itself included. Their
 * buildings share number series (BILLING_RULES section 9), so prefixes are
 * checked across all of them. An entity without a GSTIN is on its own.
 */
export async function sameGstinEntityIds(
  s: Scoped,
  billingEntityId: string,
): Promise<string[]> {
  const [entity] = await s.tx
    .select({ gstin: billingEntities.gstin })
    .from(billingEntities)
    .where(s.where(billingEntities, eq(billingEntities.id, billingEntityId)));
  if (!entity?.gstin) return [billingEntityId];
  const rows = await s.tx
    .select({ id: billingEntities.id })
    .from(billingEntities)
    .where(s.where(billingEntities, eq(billingEntities.gstin, entity.gstin)));
  return [
    billingEntityId,
    ...rows.map((r) => r.id).filter((id) => id !== billingEntityId),
  ];
}
