// Shared test data: an organization with one row in every table.

import * as schema from "../schema";
import { createAuthUser, only, type TestTx } from "./harness";

export type Role = (typeof schema.membershipRole.enumValues)[number];

/** An organization with one row in every table, and a member with `role`. */
export async function seedOrg(tx: TestTx, name: string, role: Role = "owner") {
  const userId = await createAuthUser(tx, `${name}-${role}@example.test`);
  const org = only(
    await tx.insert(schema.organizations).values({ name }).returning(),
  );
  await tx.insert(schema.memberships).values({
    organizationId: org.id,
    userId,
    email: `${name}-${role}@example.test`,
    role,
    status: "active",
  });
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
      .values({ organizationId: org.id, buildingId: building.id, label: "1" })
      .returning(),
  );
  const unit = only(
    await tx
      .insert(schema.units)
      .values({
        organizationId: org.id,
        buildingId: building.id,
        floorId: floor.id,
        code: "101",
        carpetArea: 100000,
        chargeableArea: 130000,
      })
      .returning(),
  );
  const tenant = only(
    await tx
      .insert(schema.tenants)
      .values({
        organizationId: org.id,
        companyName: `${name} Tenant`,
        billingAddress: "Mumbai",
        stateCode: "27",
      })
      .returning(),
  );
  await tx.insert(schema.tenantContacts).values({
    organizationId: org.id,
    tenantId: tenant.id,
    name: "Accounts",
  });
  const lease = only(
    await tx
      .insert(schema.leases)
      .values({
        organizationId: org.id,
        tenantId: tenant.id,
        buildingId: building.id,
        startDate: "2026-04-01",
        endDate: "2029-03-31",
        rentCommencementDate: "2026-04-01",
      })
      .returning(),
  );
  await tx.insert(schema.leaseUnits).values({
    organizationId: org.id,
    leaseId: lease.id,
    buildingId: building.id,
    unitId: unit.id,
    area: unit.chargeableArea,
  });
  const charge = only(
    await tx
      .insert(schema.leaseCharges)
      .values({
        organizationId: org.id,
        leaseId: lease.id,
        type: "rent",
        basis: "per_sqft",
        rateOrAmount: 9000,
        startDate: "2026-04-01",
        timing: "advance",
        gstRateBp: 1800,
        sacCode: "997212",
        waivedDuringRentFree: true,
      })
      .returning(),
  );
  await tx.insert(schema.escalationRules).values({
    organizationId: org.id,
    leaseId: lease.id,
    percentBp: 500,
    everyMonths: 12,
  });
  await tx.insert(schema.customEscalations).values({
    organizationId: org.id,
    leaseId: lease.id,
    chargeId: charge.id,
    effectiveDate: "2027-10-01",
    newAmount: 10000,
  });
  await tx.insert(schema.criticalDates).values({
    organizationId: org.id,
    leaseId: lease.id,
    type: "expiry",
    date: "2029-03-31",
    remindDays: [180, 90, 30],
  });
  return { userId, org, entity, building, unit, tenant, lease, charge };
}
