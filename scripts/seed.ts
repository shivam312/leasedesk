// pnpm db:seed: load the demo organization (2 buildings, 40 tenants, 45 leases).
// Each schema task adds its rows here (db-change skill). Safe to run twice:
// it does nothing if the demo organization already exists.

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import { only } from "../src/lib/db/rows";
import { makeGstin } from "../src/lib/india/identifiers";
import { rentCommencement } from "../src/lib/billing/rent-free";
import { addDays, addMonths } from "../src/lib/billing/dates";
import { billingSettings } from "../src/lib/settings/billing";
import { defaultSettings } from "../src/lib/settings/schema";
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

      const andheriUnits = await seedBuilding(tx, {
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
      const whitefieldUnits = await seedBuilding(tx, {
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
      const tenants = await seedTenants(tx, org.id);
      await seedLeases(tx, tenants, [...andheriUnits, ...whitefieldUnits]);
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
  return tx.insert(schema.units).values(units).returning();
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
  return tenants;
}

/**
 * 45 leases, one vacant unit each: every tenant has one, and the first five
 * have a second. Terms of 3 to 9 years starting between 2022 and 2026; some
 * with a rent-free period (months or days), a few in notice and one draft.
 */
async function seedLeases(
  tx: Tx,
  tenants: (typeof schema.tenants.$inferSelect)[],
  units: (typeof schema.units.$inferSelect)[],
) {
  const settings = billingSettings(defaultSettings());
  const free = units.filter((u) => u.status === "vacant");
  for (let i = 0; i < 45; i++) {
    const tenant = tenants[i % tenants.length];
    const unit = free[i];
    if (!tenant || !unit) throw new Error("Not enough vacant units to seed");
    const year = 2022 + (i % 5);
    const month = 1 + ((i * 5) % 12);
    const startDate = `${year}-${String(month).padStart(2, "0")}-${i % 4 === 1 ? "15" : "01"}`;
    const years = 3 + (i % 7);
    const endDate = addDays(
      addMonths(startDate, years * 12, "roll_forward"),
      -1,
    );
    const rentFreeMonths = i % 3 === 0 ? 2 : 0;
    const rentFreeDays = !rentFreeMonths && i % 10 === 4 ? 45 : 0;
    const status =
      i === 44 ? "draft" : i % 11 === 7 ? "in_notice" : ("active" as const);
    const areaBasis = i % 6 === 5 ? "carpet" : ("chargeable" as const);
    const lease = only(
      await tx
        .insert(schema.leases)
        .values({
          organizationId: unit.organizationId,
          tenantId: tenant.id,
          buildingId: unit.buildingId,
          status,
          startDate,
          endDate,
          lockInEndDate: addDays(addMonths(startDate, 36, "roll_forward"), -1),
          noticePeriodMonths: 3,
          rentFreeMonths,
          rentFreeDays,
          rentCommencementDate: rentCommencement(
            {
              id: `seed-${i}`,
              startDate,
              endDate,
              rentFreeMonths,
              rentFreeDays,
            },
            settings,
          ).date,
          areaBasis,
          // Three months of rent at roughly ₹90 per sq ft.
          depositAmount: Math.round((unit.chargeableArea * 9000 * 3) / 100),
        })
        .returning(),
    );
    await tx.insert(schema.leaseUnits).values({
      organizationId: unit.organizationId,
      leaseId: lease.id,
      buildingId: unit.buildingId,
      unitId: unit.id,
      area: areaBasis === "carpet" ? unit.carpetArea : unit.chargeableArea,
    });
    // Rent per sq ft (₹80–₹120), CAM per sq ft, and parking for every third
    // lease; building defaults (18% GST, SAC 997212, in advance) copied on (D16).
    const chargeDefaults = {
      organizationId: unit.organizationId,
      leaseId: lease.id,
      startDate,
      timing: "advance" as const,
      gstRateBp: 1800,
      sacCode: "997212",
    };
    const charges = await tx
      .insert(schema.leaseCharges)
      .values([
        {
          ...chargeDefaults,
          type: "rent" as const,
          basis: "per_sqft" as const,
          rateOrAmount: 8000 + ((i * 1000) % 4000) + (i % 2) * 50,
          waivedDuringRentFree: true,
        },
        {
          ...chargeDefaults,
          type: "cam" as const,
          basis: "per_sqft" as const,
          rateOrAmount: 1500,
          // A quarterly CAM charge in arrears on a few leases.
          ...(i % 8 === 2
            ? { frequency: "quarterly" as const, timing: "arrears" as const }
            : {}),
          waivedDuringRentFree: false,
        },
        ...(i % 3 === 1
          ? [
              {
                ...chargeDefaults,
                type: "parking" as const,
                basis: "per_slot" as const,
                rateOrAmount: 300000,
                quantity: 1 + (i % 4),
                waivedDuringRentFree: false,
              },
            ]
          : []),
      ])
      .returning();
    // Most leases: 5% every 12 months; some 15% every 36 months; one with
    // a custom increase on a set date.
    await tx.insert(schema.escalationRules).values(
      i % 5 === 3
        ? {
            organizationId: unit.organizationId,
            leaseId: lease.id,
            percentBp: 1500,
            everyMonths: 36,
          }
        : {
            organizationId: unit.organizationId,
            leaseId: lease.id,
            percentBp: 500,
            everyMonths: 12,
            anchor: rentFreeMonths ? "rent_commencement" : "lease_start",
          },
    );
    const rent = charges[0];
    if (i === 10 && rent) {
      await tx.insert(schema.customEscalations).values({
        organizationId: unit.organizationId,
        leaseId: lease.id,
        chargeId: rent.id,
        effectiveDate: addMonths(startDate, 18, "roll_forward"),
        percentBp: 750,
      });
    }
    if (status !== "draft") {
      await tx
        .update(schema.units)
        .set({ status: "leased" })
        .where(eq(schema.units.id, unit.id));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
