import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  actAs,
  closeDb,
  createAuthUser,
  inRollback,
  only,
  skipDbTests,
  type TestTx,
} from "./harness";

async function orgWithBuilding(tx: TestTx, name: string) {
  const org = only(
    await tx.insert(schema.organizations).values({ name }).returning(),
  );
  const entity = only(
    await tx
      .insert(schema.billingEntities)
      .values({
        organizationId: org.id,
        legalName: name,
        stateCode: "27",
        address: "Mumbai",
      })
      .returning(),
  );
  const building = only(
    await tx
      .insert(schema.buildings)
      .values({
        organizationId: org.id,
        name: `${name} Tower`,
        address: "Andheri",
        city: "Mumbai",
        stateCode: "27",
        billingEntityId: entity.id,
        invoicePrefix: "T",
        creditNotePrefix: "TCN",
      })
      .returning(),
  );
  const floor = only(
    await tx
      .insert(schema.floors)
      .values({
        organizationId: org.id,
        buildingId: building.id,
        label: "1st",
      })
      .returning(),
  );
  return { org, entity, building, floor };
}

describe.skipIf(skipDbTests)("property tables", () => {
  afterAll(closeDb);

  it("stores a unit with areas in hundredths of a sq ft, with or without a floor", async () => {
    await inRollback(async (tx) => {
      const { org, building, floor } = await orgWithBuilding(tx, "A");
      const units = await tx
        .insert(schema.units)
        .values([
          {
            organizationId: org.id,
            buildingId: building.id,
            floorId: floor.id,
            code: "101",
            carpetArea: 125050,
            chargeableArea: 162565,
          },
          {
            organizationId: org.id,
            buildingId: building.id,
            code: "Shop 1",
            carpetArea: 40000,
            chargeableArea: 52000,
          },
        ])
        .returning();
      expect(units.map((u) => [u.carpetArea, u.status])).toEqual([
        [125050, "vacant"],
        [40000, "vacant"],
      ]);
    });
  });

  it("refuses a unit that points at another organization's building", async () => {
    await inRollback(async (tx) => {
      const a = await orgWithBuilding(tx, "A");
      const b = await orgWithBuilding(tx, "B");
      await expect(
        tx.insert(schema.units).values({
          organizationId: a.org.id,
          buildingId: b.building.id,
          code: "101",
          carpetArea: 100,
          chargeableArea: 100,
        }),
      ).rejects.toThrow();
    });
  });

  it("refuses a unit on a floor of a different building", async () => {
    await inRollback(async (tx) => {
      const a = await orgWithBuilding(tx, "A");
      const other = only(
        await tx
          .insert(schema.buildings)
          .values({
            organizationId: a.org.id,
            name: "Annexe",
            address: "Andheri",
            city: "Mumbai",
            stateCode: "27",
            billingEntityId: a.entity.id,
            invoicePrefix: "AN",
            creditNotePrefix: "ANCN",
          })
          .returning(),
      );
      await expect(
        tx.insert(schema.units).values({
          organizationId: a.org.id,
          buildingId: other.id,
          floorId: a.floor.id,
          code: "101",
          carpetArea: 100,
          chargeableArea: 100,
        }),
      ).rejects.toThrow();
    });
  });

  it("refuses a building billed from another organization's billing entity", async () => {
    await inRollback(async (tx) => {
      const a = await orgWithBuilding(tx, "A");
      const b = await orgWithBuilding(tx, "B");
      await expect(
        tx.insert(schema.buildings).values({
          organizationId: a.org.id,
          name: "Mixed",
          address: "x",
          city: "Mumbai",
          stateCode: "27",
          billingEntityId: b.entity.id,
          invoicePrefix: "M",
          creditNotePrefix: "MCN",
        }),
      ).rejects.toThrow();
    });
  });

  it("has row-level security on for buildings, floors and units", async () => {
    await inRollback(async (tx) => {
      await orgWithBuilding(tx, "Hidden");
      await actAs(tx, await createAuthUser(tx, "stranger@example.test"));
      expect(await tx.select().from(schema.buildings)).toEqual([]);
      expect(await tx.select().from(schema.floors)).toEqual([]);
      expect(await tx.select().from(schema.units)).toEqual([]);
    });
  });
});
