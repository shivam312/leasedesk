// Loading what's already saved for the buildings and units import, and
// saving its plan: every row logged, all in the caller's one transaction.

import { asc, eq } from "drizzle-orm";
import { insertLogged } from "@/lib/db/activity-log";
import { billingEntities, buildings, floors, units } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { ExistingProperty, PropertyPlan } from "./property";

export async function existingProperty(s: Scoped): Promise<ExistingProperty> {
  const [entities, buildingRows, floorRows, unitRows] = await Promise.all([
    s.tx
      .select({
        id: billingEntities.id,
        gstin: billingEntities.gstin,
        legalName: billingEntities.legalName,
      })
      .from(billingEntities)
      .where(s.where(billingEntities)),
    s.tx.select().from(buildings).where(s.where(buildings)),
    s.tx
      .select()
      .from(floors)
      .where(s.where(floors))
      .orderBy(asc(floors.sortOrder)),
    s.tx
      .select({ buildingId: units.buildingId, code: units.code })
      .from(units)
      .where(s.where(units)),
  ]);
  return {
    entities,
    buildings: buildingRows.map((b) => ({
      id: b.id,
      name: b.name,
      billingEntityId: b.billingEntityId,
      invoicePrefix: b.invoicePrefix,
      creditNotePrefix: b.creditNotePrefix,
      floors: floorRows
        .filter((f) => f.buildingId === b.id)
        .map((f) => ({ id: f.id, label: f.label })),
      unitCodes: unitRows
        .filter((u) => u.buildingId === b.id)
        .map((u) => u.code),
    })),
  };
}

/** Save the plan: buildings, then floors added as units name them, then units. */
export async function saveProperty(s: Scoped, plan: PropertyPlan) {
  const buildingIds = new Map<string, string>();
  for (const b of plan.buildings) {
    const { key, row, ...values } = b;
    void row;
    const saved = await insertLogged(s, buildings, values);
    buildingIds.set(key, saved.id);
  }
  const newFloors = new Map<string, string>();
  const nextOrder = new Map<string, number>();
  let floorCount = 0;
  for (const u of plan.units) {
    const buildingId =
      "existingId" in u.building
        ? u.building.existingId
        : buildingIds.get(u.building.newKey)!;
    let floorId: string | null = null;
    if (u.floor && "existingId" in u.floor) floorId = u.floor.existingId;
    else if (u.floor) {
      const k = `${buildingId}|${u.floor.newLabel.toLowerCase()}`;
      floorId = newFloors.get(k) ?? null;
      if (!floorId) {
        if (!nextOrder.has(buildingId)) {
          const existing = await s.tx
            .select({ sortOrder: floors.sortOrder })
            .from(floors)
            .where(s.where(floors, eq(floors.buildingId, buildingId)));
          nextOrder.set(
            buildingId,
            existing.reduce((m, f) => Math.max(m, f.sortOrder + 1), 0),
          );
        }
        const order = nextOrder.get(buildingId)!;
        nextOrder.set(buildingId, order + 1);
        const floor = await insertLogged(s, floors, {
          buildingId,
          label: u.floor.newLabel,
          sortOrder: order,
        });
        floorId = floor.id;
        newFloors.set(k, floorId);
        floorCount++;
      }
    }
    await insertLogged(s, units, {
      buildingId,
      floorId,
      code: u.code,
      carpetArea: u.carpetArea,
      chargeableArea: u.chargeableArea,
    });
  }
  return {
    buildings: plan.buildings.length,
    floors: floorCount,
    units: plan.units.length,
  };
}
