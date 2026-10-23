// pnpm db:seed: load the demo organization (2 buildings, 40 tenants, 45 leases).
// Each schema task adds its rows here (db-change skill). Safe to run twice:
// it does nothing if the demo organization already exists.

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import { only } from "../src/lib/db/rows";
import { makeGstin } from "../src/lib/india/identifiers";
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
            gstin: makeGstin("27", "AABCD1234E"),
            bankName: "HDFC Bank",
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
            gstin: makeGstin("29", "AABCD1234E"),
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
      await seedTenants(tx, org.id);
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

const TENANT_NAMES = [
  "Acme Software",
  "Bharat Logistics",
  "Coastal Foods",
  "Deccan Pharma",
  "Everest Consulting",
  "Fortune Textiles",
  "Ganga Finance",
  "Himalaya Travels",
  "Indus Analytics",
  "Jaipur Gems",
  "Kaveri Engineering",
  "Lotus Clinics",
  "Malabar Exports",
  "Narmada Infra",
  "Orbit Media",
  "Pinnacle Legal",
  "Quantum Labs",
  "Rajdhani Caterers",
  "Sahyadri Systems",
  "Tata Street Cafe",
  "Udaipur Crafts",
  "Vindhya Steel",
  "Western Ghats Coffee",
  "Yamuna Insurance",
  "Zenith Architects",
  "Aravali Learning",
  "Brahmaputra Tea",
  "Chola Motors",
  "Dhruv Diagnostics",
  "Ellora Designs",
  "Falcon Security",
  "Godavari Agro",
  "Hampi Hospitality",
  "Iris Optics",
  "Jhelum Apparel",
  "Konark Realty",
  "Lakshmi Jewellers",
  "Meghdoot Couriers",
  "Nilgiri Wellness",
  "Omkar Printers",
];

/** 40 tenants: mostly companies that deduct TDS; a few proprietors who don't, and some without a GSTIN. */
async function seedTenants(tx: Tx, organizationId: string) {
  const rows = TENANT_NAMES.map((name, i) => {
    const isCompany = i % 7 !== 3;
    const stateCode = i % 2 === 0 ? "27" : "29";
    // PAN: 5 letters (the 4th is C for a company, P for a person), 4 digits, 1 letter.
    const letter = (n: number) => String.fromCharCode(65 + (n % 26));
    const pan = `AAB${isCompany ? "C" : "P"}${letter(i)}${1000 + i * 37}${letter(i + 5)}`;
    const company = {
      organizationId,
      companyName: isCompany ? `${name} Pvt Ltd` : name,
      gstin: i % 9 === 5 ? null : makeGstin(stateCode, pan),
      pan,
      billingAddress: `${100 + i}, ${stateCode === "27" ? "Andheri East, Mumbai" : "Whitefield, Bengaluru"}`,
      stateCode,
      notes: i === 0 ? "Pays by NEFT on the 5th." : null,
    };
    if (isCompany) {
      // One company deducts no TDS on parking, as some do (D10).
      return i === 2 ? { ...company, deductsTdsParking: false } : company;
    }
    return {
      ...company,
      deductsTdsRent: false,
      deductsTdsCam: false,
      deductsTdsParking: false,
      deductsTdsOther: false,
    };
  });
  const tenants = await tx.insert(schema.tenants).values(rows).returning();

  const contacts = tenants.flatMap((tenant, i) => {
    const slug = TENANT_NAMES[i]!.toLowerCase().replace(/[^a-z]+/g, "");
    const primary = {
      organizationId,
      tenantId: tenant.id,
      name: `Accounts, ${TENANT_NAMES[i]}`,
      role: "billing" as const,
      email: `accounts@${slug}.example`,
      phone: `+9198${String(20000000 + i * 1234567).slice(0, 8)}`,
      whatsapp: true,
      isPrimary: true,
    };
    if (i % 3 !== 0) return [primary];
    return [
      primary,
      {
        organizationId,
        tenantId: tenant.id,
        name: `Admin, ${TENANT_NAMES[i]}`,
        role: "admin" as const,
        email: `admin@${slug}.example`,
        phone: null,
        whatsapp: false,
        isPrimary: false,
      },
    ];
  });
  await tx.insert(schema.tenantContacts).values(contacts);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
