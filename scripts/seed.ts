// pnpm db:seed: load the demo organization (2 buildings, 40 tenants, 45 leases).
// Each schema task adds its rows here (db-change skill). Safe to run twice:
// it does nothing if the demo organization already exists.

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import { only } from "../src/lib/db/rows";
import { connectForScript } from "./db-env";

const DEMO_ORG_NAME = "Demo Properties";

async function main() {
  const { sql, where } = connectForScript();
  const db = drizzle(sql, { schema, casing: "snake_case" });
  try {
    const existing = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.name, DEMO_ORG_NAME));
    if (existing.length > 0) {
      console.info(`The ${where} already has demo data; nothing to do.`);
      return;
    }

    await db.transaction(async (tx) => {
      const org = only(
        await tx
          .insert(schema.organizations)
          .values({
            name: DEMO_ORG_NAME,
            legalName: "Demo Properties Private Limited",
            pan: "AABCD1234E",
          })
          .returning(),
      );

      const [mumbaiEntity, bengaluruEntity] = await tx
        .insert(schema.billingEntities)
        .values([
          {
            organizationId: org.id,
            legalName: "Demo Properties Private Limited",
            gstin: "27AABCD1234E1Z5",
            stateCode: "27",
            address: "4th Floor, Demo House, Andheri East, Mumbai 400069",
            bankAccountName: "Demo Properties Pvt Ltd",
            bankAccountNumber: "000123456789",
            ifsc: "HDFC0000123",
            upiId: "demoproperties@hdfcbank",
          },
          {
            organizationId: org.id,
            legalName: "Demo Properties Private Limited (Karnataka)",
            gstin: "29AABCD1234E1Z1",
            stateCode: "29",
            address: "2nd Floor, Demo Towers, Whitefield, Bengaluru 560066",
            // No bank or UPI yet, so screens show the "add bank details" state.
          },
        ])
        .returning();
      if (!mumbaiEntity || !bengaluruEntity)
        throw new Error("Billing entities were not created");

      await seedBuilding(tx, {
        organizationId: org.id,
        name: "Andheri Business Centre",
        address: "Plot 12, MIDC, Andheri East",
        city: "Mumbai",
        stateCode: "27",
        billingEntityId: mumbaiEntity.id,
        invoicePrefix: "ABC",
        creditNotePrefix: "ABCCN",
        floorLabels: ["Ground", "1st", "2nd", "3rd", "4th", "5th"],
      });
      await seedBuilding(tx, {
        organizationId: org.id,
        name: "Whitefield Tech Park",
        address: "EPIP Zone, Whitefield",
        city: "Bengaluru",
        stateCode: "29",
        billingEntityId: bengaluruEntity.id,
        invoicePrefix: "WTP",
        creditNotePrefix: "WTPCN",
        floorLabels: ["1st", "2nd", "3rd", "4th"],
        // A building-level override, so the settings screens have one to show.
        settings: { "invoice.dueDays": 10 },
      });
    });
    console.info(`Seeded the demo organization into the ${where}.`);
  } finally {
    await sql.end();
  }
}

type Tx = Parameters<
  Parameters<ReturnType<typeof drizzle<typeof schema>>["transaction"]>[0]
>[0];

/** A building with five units per floor; areas vary but are fixed, so reseeding gives the same data. */
async function seedBuilding(
  tx: Tx,
  input: Omit<typeof schema.buildings.$inferInsert, "id"> & {
    floorLabels: string[];
  },
) {
  const { floorLabels, ...values } = input;
  const building = only(
    await tx.insert(schema.buildings).values(values).returning(),
  );
  const floors = await tx
    .insert(schema.floors)
    .values(
      floorLabels.map((label, sortOrder) => ({
        organizationId: building.organizationId,
        buildingId: building.id,
        label,
        sortOrder,
      })),
    )
    .returning();

  const units = floors.flatMap((floor) =>
    [1, 2, 3, 4, 5].map((n) => {
      const carpetArea =
        (800 + (((floor.sortOrder * 5 + n) * 137) % 1700)) * 100;
      return {
        organizationId: building.organizationId,
        buildingId: building.id,
        floorId: floor.id,
        code: `${floor.sortOrder}0${n}`,
        carpetArea,
        // Chargeable (super built-up) area is about 30% more than carpet.
        chargeableArea: Math.round((carpetArea * 13) / 1000) * 100,
        status: (n === 5 && floor.sortOrder === 2
          ? "fit_out"
          : n === 4 && floor.sortOrder === 3
            ? "blocked"
            : "vacant") as "vacant" | "fit_out" | "blocked",
      };
    }),
  );
  await tx.insert(schema.units).values(units);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
