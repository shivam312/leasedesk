// Reads for the buildings and units screens, always through withOrg/runScoped.

import { asc, eq, sql } from "drizzle-orm";
import { billingEntities, buildings, floors, units } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

export async function listBuildings(s: Scoped) {
  return s.tx
    .select({
      id: buildings.id,
      name: buildings.name,
      city: buildings.city,
      unitCount: sql<number>`count(${units.id})::int`,
      vacantCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'vacant')::int`,
      totalArea: sql<number>`coalesce(sum(${units.chargeableArea}), 0)::int`,
    })
    .from(buildings)
    .leftJoin(units, eq(units.buildingId, buildings.id))
    .where(s.where(buildings))
    .groupBy(buildings.id)
    .orderBy(asc(buildings.name));
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
