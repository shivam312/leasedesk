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

async function orgWithTenant(tx: TestTx, name: string) {
  const org = only(
    await tx.insert(schema.organizations).values({ name }).returning(),
  );
  const tenant = only(
    await tx
      .insert(schema.tenants)
      .values({
        organizationId: org.id,
        companyName: `${name} Pvt Ltd`,
        billingAddress: "Mumbai",
        stateCode: "27",
      })
      .returning(),
  );
  return { org, tenant };
}

const contact = (organizationId: string, tenantId: string) => ({
  organizationId,
  tenantId,
  name: "Accounts",
  email: "accounts@example.test",
});

describe.skipIf(skipDbTests)("tenant tables", () => {
  afterAll(closeDb);

  it("defaults TDS to 10% on every charge type, as for a company (D10)", async () => {
    await inRollback(async (tx) => {
      const { tenant } = await orgWithTenant(tx, "A");
      expect(tenant).toMatchObject({
        deductsTdsRent: true,
        tdsRateBpRent: 1000,
        deductsTdsCam: true,
        tdsRateBpCam: 1000,
        deductsTdsParking: true,
        tdsRateBpParking: 1000,
        deductsTdsOther: true,
        tdsRateBpOther: 1000,
        settings: {},
      });
    });
  });

  it("allows only one primary contact per tenant", async () => {
    await inRollback(async (tx) => {
      const { org, tenant } = await orgWithTenant(tx, "A");
      await tx
        .insert(schema.tenantContacts)
        .values({ ...contact(org.id, tenant.id), isPrimary: true });
      await tx.insert(schema.tenantContacts).values(contact(org.id, tenant.id));
      await expect(
        tx
          .insert(schema.tenantContacts)
          .values({ ...contact(org.id, tenant.id), isPrimary: true }),
      ).rejects.toThrow();
    });
  });

  it("refuses a contact that points at another organization's tenant", async () => {
    await inRollback(async (tx) => {
      const a = await orgWithTenant(tx, "A");
      const b = await orgWithTenant(tx, "B");
      await expect(
        tx.insert(schema.tenantContacts).values(contact(a.org.id, b.tenant.id)),
      ).rejects.toThrow();
    });
  });

  it("has row-level security on for tenants and contacts", async () => {
    await inRollback(async (tx) => {
      const { org, tenant } = await orgWithTenant(tx, "Hidden");
      await tx.insert(schema.tenantContacts).values(contact(org.id, tenant.id));
      await actAs(tx, await createAuthUser(tx, "stranger@example.test"));
      expect(await tx.select().from(schema.tenants)).toEqual([]);
      expect(await tx.select().from(schema.tenantContacts)).toEqual([]);
    });
  });
});
