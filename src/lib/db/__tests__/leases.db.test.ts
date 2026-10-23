import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { seedOrg } from "./fixtures";
import {
  actAs,
  closeDb,
  createAuthUser,
  inRollback,
  only,
  skipDbTests,
  type TestTx,
} from "./harness";

const leaseValues = (
  org: {
    org: { id: string };
    tenant: { id: string };
    building: { id: string };
  },
  extra: Partial<typeof schema.leases.$inferInsert> = {},
) => ({
  organizationId: org.org.id,
  tenantId: org.tenant.id,
  buildingId: org.building.id,
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  rentCommencementDate: "2026-04-01",
  ...extra,
});

async function secondBuildingUnit(
  tx: TestTx,
  org: Awaited<ReturnType<typeof seedOrg>>,
) {
  const building = only(
    await tx
      .insert(schema.buildings)
      .values({
        organizationId: org.org.id,
        name: "Annexe",
        address: "Andheri",
        city: "Mumbai",
        stateCode: "27",
        billingEntityId: org.entity.id,
        invoicePrefix: "AN",
        creditNotePrefix: "ANCN",
      })
      .returning(),
  );
  return only(
    await tx
      .insert(schema.units)
      .values({
        organizationId: org.org.id,
        buildingId: building.id,
        code: "G01",
        carpetArea: 50000,
        chargeableArea: 65000,
      })
      .returning(),
  );
}

describe.skipIf(skipDbTests)("lease tables", () => {
  afterAll(closeDb);

  it("starts a lease as a version-1 draft with no deposit and no settings", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const lease = only(
        await tx.insert(schema.leases).values(leaseValues(a)).returning(),
      );
      expect(lease).toMatchObject({
        status: "draft",
        version: 1,
        areaBasis: "chargeable",
        depositAmount: 0,
        rentFreeMonths: 0,
        rentFreeDays: 0,
        settings: {},
      });
    });
  });

  it("refuses an end before the start, and rent-free months and days together", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx
          .insert(schema.leases)
          .values(leaseValues(a, { endDate: "2026-03-31" })),
      ).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx
          .insert(schema.leases)
          .values(leaseValues(a, { rentFreeMonths: 2, rentFreeDays: 10 })),
      ).rejects.toThrow();
    });
  });

  it("refuses a lease for another organization's tenant", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const b = await seedOrg(tx, "B");
      await expect(
        tx
          .insert(schema.leases)
          .values(leaseValues({ ...a, tenant: b.tenant })),
      ).rejects.toThrow();
    });
  });

  it("lets a lease cover only units of its own building", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const lease = only(
        await tx.insert(schema.leases).values(leaseValues(a)).returning(),
      );
      const own = a.unit;
      await tx.insert(schema.leaseUnits).values({
        organizationId: a.org.id,
        leaseId: lease.id,
        buildingId: a.building.id,
        unitId: own.id,
        area: own.chargeableArea,
      });
      const other = await secondBuildingUnit(tx, a);
      await expect(
        tx.insert(schema.leaseUnits).values({
          organizationId: a.org.id,
          leaseId: lease.id,
          buildingId: other.buildingId,
          unitId: other.id,
          area: other.chargeableArea,
        }),
      ).rejects.toThrow();
    });
  });

  it("has row-level security on for leases and lease units", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "Hidden");
      await tx.insert(schema.leases).values(leaseValues(a));
      await actAs(tx, await createAuthUser(tx, "stranger@example.test"));
      expect(await tx.select().from(schema.leases)).toEqual([]);
      expect(await tx.select().from(schema.leaseUnits)).toEqual([]);
    });
  });
});

describe.skipIf(skipDbTests)("lease terms tables", () => {
  afterAll(closeDb);

  const rentCharge = (a: Awaited<ReturnType<typeof seedOrg>>) => ({
    organizationId: a.org.id,
    leaseId: a.lease.id,
    type: "rent" as const,
    basis: "per_sqft" as const,
    rateOrAmount: 9000,
    startDate: "2026-04-01",
    timing: "advance" as const,
    gstRateBp: 1800,
    sacCode: "997212",
    waivedDuringRentFree: true,
  });

  it("needs a slot count for a per-slot charge, and only then", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx
          .insert(schema.leaseCharges)
          .values({ ...rentCharge(a), basis: "per_slot" }),
      ).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx
          .insert(schema.leaseCharges)
          .values({ ...rentCharge(a), quantity: 2 }),
      ).rejects.toThrow();
    });
  });

  it("needs an anchor date for a custom anchor, and only then", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx.insert(schema.escalationRules).values({
          organizationId: a.org.id,
          leaseId: a.lease.id,
          percentBp: 500,
          everyMonths: 12,
          anchor: "custom",
        }),
      ).rejects.toThrow();
    });
  });

  it("takes a custom increase as a new amount or a percentage, not both", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx.insert(schema.customEscalations).values({
          organizationId: a.org.id,
          leaseId: a.lease.id,
          chargeId: a.charge.id,
          effectiveDate: "2028-04-01",
          newAmount: 10000,
          percentBp: 500,
        }),
      ).rejects.toThrow();
    });
  });

  it("refuses a custom increase on a charge of another lease", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const other = only(
        await tx.insert(schema.leases).values(leaseValues(a)).returning(),
      );
      await expect(
        tx.insert(schema.customEscalations).values({
          organizationId: a.org.id,
          leaseId: other.id,
          chargeId: a.charge.id,
          effectiveDate: "2028-04-01",
          percentBp: 500,
        }),
      ).rejects.toThrow();
    });
  });

  it("needs a date to snooze to, and a label for a custom date", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx.insert(schema.criticalDates).values({
          organizationId: a.org.id,
          leaseId: a.lease.id,
          type: "expiry",
          date: "2029-03-31",
          status: "snoozed",
        }),
      ).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      await expect(
        tx.insert(schema.criticalDates).values({
          organizationId: a.org.id,
          leaseId: a.lease.id,
          type: "custom",
          date: "2027-01-01",
        }),
      ).rejects.toThrow();
    });
  });
});
