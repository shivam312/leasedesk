// One organization can't read or change another's data, and roles limit writes.

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { runScoped, type Transactional } from "../scoped";
import {
  closeDb,
  createAuthUser,
  inRollback,
  only,
  skipDbTests,
  type TestTx,
} from "./harness";

type Role = (typeof schema.membershipRole.enumValues)[number];

/** An organization with one row in every table, and a member with `role`. */
async function seedOrg(tx: TestTx, name: string, role: Role = "owner") {
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
  await tx.insert(schema.units).values({
    organizationId: org.id,
    buildingId: building.id,
    floorId: floor.id,
    code: "101",
    carpetArea: 100000,
    chargeableArea: 130000,
  });
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
  return { userId, org, entity, building, tenant };
}

const orgTables = {
  memberships: schema.memberships,
  billingEntities: schema.billingEntities,
  buildings: schema.buildings,
  floors: schema.floors,
  units: schema.units,
  tenants: schema.tenants,
  tenantContacts: schema.tenantContacts,
};

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("row-level security", () => {
  afterAll(closeDb);

  it("every table in public has row-level security and at least one policy", async () => {
    await inRollback(async (tx) => {
      const rows = await tx.execute<{
        table: string;
        rls: boolean;
        policies: number;
      }>(sql`
        select c.relname as table, c.relrowsecurity as rls,
          (select count(*)::int from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`);
      const missing = [...rows].filter((r) => !r.rls || r.policies === 0);
      expect(missing).toEqual([]);
      expect(rows.length).toBeGreaterThanOrEqual(8);
    });
  });

  it("a member sees only their own organization's rows, even without a filter", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async ({ tx: scoped }) => {
          const orgs = await scoped.select().from(schema.organizations);
          expect(orgs.map((o) => o.id)).toEqual([a.org.id]);
          for (const [name, table] of Object.entries(orgTables)) {
            const rows = await scoped.select().from(table);
            expect(rows.length, name).toBeGreaterThan(0);
            expect(
              rows.every((r) => r.organizationId === a.org.id),
              name,
            ).toBe(true);
            expect(
              rows.some((r) => r.organizationId === b.org.id),
              name,
            ).toBe(false);
          }
        },
      );
    });
  });

  it("a member can't change another organization's rows", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async ({ tx: scoped }) => {
          const updated = await scoped
            .update(schema.tenants)
            .set({ companyName: "Hijacked" })
            .where(eq(schema.tenants.id, b.tenant.id))
            .returning();
          expect(updated).toEqual([]);
          const deleted = await scoped
            .delete(schema.tenantContacts)
            .where(eq(schema.tenantContacts.organizationId, b.org.id))
            .returning();
          expect(deleted).toEqual([]);
          await expect(
            scoped.transaction((t) =>
              t.insert(schema.tenants).values({
                organizationId: b.org.id,
                companyName: "Planted",
                billingAddress: "x",
                stateCode: "27",
              }),
            ),
          ).rejects.toThrow();
        },
      );
    });
  });

  it("a removed or invited member sees nothing", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      await tx
        .update(schema.memberships)
        .set({ status: "removed" })
        .where(eq(schema.memberships.userId, a.userId));
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async ({ tx: scoped }) => {
          expect(await scoped.select().from(schema.tenants)).toEqual([]);
          expect(await scoped.select().from(schema.buildings)).toEqual([]);
        },
      );
    });
  });

  it("a viewer can read but not write", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a", "viewer");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async ({ tx: scoped, values }) => {
          expect(await scoped.select().from(schema.tenants)).toHaveLength(1);
          const updated = await scoped
            .update(schema.tenants)
            .set({ notes: "x" })
            .returning();
          expect(updated).toEqual([]);
          await expect(
            scoped.transaction((t) =>
              t.insert(schema.tenants).values(
                values({
                  companyName: "New",
                  billingAddress: "x",
                  stateCode: "27",
                }),
              ),
            ),
          ).rejects.toThrow();
        },
      );
    });
  });

  it("a property manager can edit units but not billing entities", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a", "property_manager");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async ({ tx: scoped, where }) => {
          const units = await scoped
            .update(schema.units)
            .set({ status: "blocked" })
            .where(where(schema.units))
            .returning();
          expect(units).toHaveLength(1);
          const entities = await scoped
            .update(schema.billingEntities)
            .set({ upiId: "x@upi" })
            .where(where(schema.billingEntities))
            .returning();
          expect(entities).toEqual([]);
        },
      );
    });
  });

  it("only an owner can add members", async () => {
    await inRollback(async (tx) => {
      const accounts = await seedOrg(tx, "a", "accounts");
      await runScoped(
        asDb(tx),
        { userId: accounts.userId, organizationId: accounts.org.id },
        async ({ tx: scoped, values }) => {
          await expect(
            scoped.transaction((t) =>
              t
                .insert(schema.memberships)
                .values(
                  values({ email: "x@example.test", role: "owner" as const }),
                ),
            ),
          ).rejects.toThrow();
        },
      );
    });
  });
});
