// Loading what each report needs, for the current organization. Building the
// report from it is pure (rent-roll.ts, vacancy.ts and the rest).

import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import {
  buildings,
  invoices,
  paymentAllocations,
  payments,
  customEscalations,
  escalationRules,
  floors,
  leaseCharges,
  leases,
  leaseUnits,
  tenants,
  units,
} from "@/lib/db/schema";
import { openInvoiceRows } from "@/lib/alerts/queries";
import type { Scoped } from "@/lib/db/scoped";
import { savedLeaseInput } from "@/lib/leases/rows";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { ageing, collections } from "./collections";
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

export async function collectionsReport(
  s: Scoped,
  from: PlainDate,
  to: PlainDate,
): Promise<Report> {
  const rows = await s.tx
    .select({
      id: payments.id,
      kind: payments.kind,
      receivedDate: payments.receivedDate,
      tenantName: tenants.companyName,
      mode: payments.mode,
      reference: payments.reference,
      amountReceived: payments.amountReceived,
      tdsDeducted: payments.tdsDeducted,
    })
    .from(payments)
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .where(
      s.where(
        payments,
        and(gte(payments.receivedDate, from), lte(payments.receivedDate, to)),
      ),
    );
  const ids = rows.map((r) => r.id);
  const allocated =
    ids.length === 0
      ? []
      : await s.tx
          .select({
            paymentId: paymentAllocations.paymentId,
            number: invoices.number,
          })
          .from(paymentAllocations)
          .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
          .where(
            s.where(
              paymentAllocations,
              inArray(paymentAllocations.paymentId, ids),
            ),
          );
  return collections(
    rows.map((r) => ({
      ...r,
      invoiceNumbers: [
        ...new Set(
          allocated
            .filter((a) => a.paymentId === r.id && a.number)
            .map((a) => a.number!),
        ),
      ].sort(),
    })),
    from,
    to,
  );
}

/** Unpaid as recorded now, aged to `today`. */
export async function ageingReport(
  s: Scoped,
  today: PlainDate,
): Promise<Report> {
  const open = await openInvoiceRows(s);
  const ids = open.map((o) => o.id);
  const details =
    ids.length === 0
      ? []
      : await s.tx
          .select({
            id: invoices.id,
            number: invoices.number,
            invoiceDate: invoices.invoiceDate,
          })
          .from(invoices)
          .where(s.where(invoices, inArray(invoices.id, ids)));
  const byId = new Map(details.map((d) => [d.id, d]));
  return ageing(
    open.map((o) => ({
      tenantName: o.tenantName,
      number: byId.get(o.id)?.number ?? "",
      invoiceDate: byId.get(o.id)?.invoiceDate ?? o.dueDate,
      dueDate: o.dueDate,
      outstandingPaise: o.outstandingPaise,
      expectedTdsPaise: o.expectedTdsPaise,
    })),
    today,
  );
}
