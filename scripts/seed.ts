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

      await tx.insert(schema.billingEntities).values([
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
      ]);
    });
    console.info(`Seeded the demo organization into the ${where}.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
