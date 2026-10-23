// Loading what each report needs, for the current organization. Building the
// report from it is pure (rent-roll.ts, vacancy.ts and the rest).

import { asc, eq, inArray, ne } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import {
  buildings,
  customEscalations,
  escalationRules,
  floors,
  leaseCharges,
  leases,
  leaseUnits,
  tenants,
  units,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { savedLeaseInput } from "@/lib/leases/rows";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import type { Report } from "./report";
import { rentRoll, type RentRollLease } from "./rent-roll";
import { vacancy } from "./vacancy";

/** Every saved (not draft) lease with its terms and resolved settings. */
export async function rentRollLeases(s: Scoped): Promise<RentRollLease[]> {
  const rows = await s.tx
    .select({
      lease: leases,
      tenantName: tenants.companyName,
      building: {
        id: buildings.id,
        name: buildings.name,
        entity: buildings.billingEntityId,
      },
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(buildings, eq(buildings.id, leases.buildingId))
    .where(s.where(leases, ne(leases.status, "draft")));
  const ids = rows.map((r) => r.lease.id);
  if (ids.length === 0) return [];
  const [unitRows, charges, rules, customs] = await Promise.all([
    s.tx
      .select({
        leaseId: leaseUnits.leaseId,
        code: units.code,
        area: leaseUnits.area,
      })
      .from(leaseUnits)
      .innerJoin(units, eq(units.id, leaseUnits.unitId))
      .where(s.where(leaseUnits, inArray(leaseUnits.leaseId, ids)))
      .orderBy(asc(units.code)),
    s.tx
      .select()
      .from(leaseCharges)
      .where(s.where(leaseCharges, inArray(leaseCharges.leaseId, ids)))
      .orderBy(leaseCharges.createdAt, leaseCharges.id),
    s.tx
      .select()
      .from(escalationRules)
      .where(s.where(escalationRules, inArray(escalationRules.leaseId, ids))),
    s.tx
      .select()
      .from(customEscalations)
      .where(
        s.where(customEscalations, inArray(customEscalations.leaseId, ids)),
      ),
  ]);
  const result: RentRollLease[] = [];
  for (const { lease, tenantName, building } of rows) {
    const own = unitRows.filter((u) => u.leaseId === lease.id);
    const settings = billingSettings(
      await loadSettings(s, {
        billingEntityId: building.entity,
        buildingId: building.id,
        tenantId: lease.tenantId,
        leaseSettings: lease.settings,
      }),
    );
    result.push({
      leaseId: lease.id,
      status: lease.status,
      tenantName,
      buildingName: building.name,
      unitCodes: own
        .map((u) => u.code)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
      area: own.reduce((t, u) => t + u.area, 0),
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentStartsOn: lease.rentCommencementDate,
      lockInEndDate: lease.lockInEndDate,
      depositPaise: lease.depositAmount,
      input: savedLeaseInput(
        lease,
        own,
        charges.filter((c) => c.leaseId === lease.id),
        rules.filter((r) => r.leaseId === lease.id),
        customs.filter((c) => c.leaseId === lease.id),
      ),
      settings,
    });
  }
  return result;
}

export async function rentRollReport(
  s: Scoped,
  asOf: PlainDate,
): Promise<Report> {
  return rentRoll(await rentRollLeases(s), asOf);
}

export async function vacancyReport(
  s: Scoped,
  asOf: PlainDate,
): Promise<Report> {
  const [unitRows, leaseRows] = await Promise.all([
    s.tx
      .select({
        id: units.id,
        buildingName: buildings.name,
        floorLabel: floors.label,
        code: units.code,
        area: units.chargeableArea,
        status: units.status,
      })
      .from(units)
      .innerJoin(buildings, eq(buildings.id, units.buildingId))
      .leftJoin(floors, eq(floors.id, units.floorId))
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
  return vacancy(unitRows, leaseRows, asOf);
}
