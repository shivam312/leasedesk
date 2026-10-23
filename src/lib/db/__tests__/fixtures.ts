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

const EXPLAINED = { rule: "Fixed amount", steps: [], result: 100000 };

/** A draft invoice with one ₹1,000 rent line plus 18% GST, for `seedOrg`'s lease. */
export async function draftInvoice(
  tx: TestTx,
  a: Awaited<ReturnType<typeof seedOrg>>,
  runMonth = "2026-11-01",
) {
  const invoice = only(
    await tx
      .insert(schema.invoices)
      .values({
        organizationId: a.org.id,
        tenantId: a.tenant.id,
        leaseId: a.lease.id,
        buildingId: a.building.id,
        billingEntityId: a.entity.id,
        runMonth,
        invoiceDate: runMonth,
        dueDate: runMonth,
        periodStart: runMonth,
        periodEnd: runMonth,
        placeOfSupply: "27",
        supplyType: "intra_state",
        taxableTotal: 100000,
        cgstTotal: 9000,
        sgstTotal: 9000,
        igstTotal: 0,
        grandTotal: 118000,
        expectedTds: 10000,
      })
      .returning(),
  );
  const line = only(
    await tx
      .insert(schema.invoiceLines)
      .values({
        organizationId: a.org.id,
        invoiceId: invoice.id,
        leaseId: a.lease.id,
        chargeId: a.charge.id,
        chargeType: "rent",
        position: 1,
        description: "Rent",
        periodStart: runMonth,
        periodEnd: runMonth,
        sacCode: "997212",
        taxableAmount: 100000,
        gstRateBp: 1800,
        cgst: 9000,
        sgst: 9000,
        igst: 0,
        explanation: { amount: EXPLAINED, tax: EXPLAINED },
      })
      .returning(),
  );
  return { invoice, line };
}
