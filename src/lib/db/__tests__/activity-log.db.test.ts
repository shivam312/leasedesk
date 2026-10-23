import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  deleteLogged,
  insertLogged,
  logActivity,
  toLogJson,
  updateLogged,
} from "../activity-log";
import * as schema from "../schema";
import { runScoped, type Transactional } from "../scoped";
import { seedOrg } from "./fixtures";
import { closeDb, inRollback, skipDbTests, type TestTx } from "./harness";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe("toLogJson", () => {
  it("keeps bigint paise exact as strings", () => {
    expect(toLogJson({ amount: 9007199254740993n, note: "x" })).toEqual({
      amount: "9007199254740993",
      note: "x",
    });
  });

  it("turns timestamps into ISO strings and keeps null", () => {
    expect(toLogJson({ at: new Date("2026-04-01T00:00:00Z") })).toEqual({
      at: "2026-04-01T00:00:00.000Z",
    });
    expect(toLogJson(null)).toBeNull();
  });
});

describe.skipIf(skipDbTests)("activity log", () => {
  afterAll(closeDb);

  it("logs create, update and delete with who, before and after", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async (s) => {
          const tenant = await insertLogged(s, schema.tenants, {
            companyName: "Logged Ltd",
            billingAddress: "Pune",
            stateCode: "27",
          });
          expect(tenant.organizationId).toBe(a.org.id);
          const updated = await updateLogged(s, schema.tenants, tenant.id, {
            companyName: "Logged Pvt Ltd",
          });
          expect(updated?.companyName).toBe("Logged Pvt Ltd");
          expect(await deleteLogged(s, schema.tenants, tenant.id)).toBe(true);

          const log = await s.tx
            .select()
            .from(schema.activityLog)
            .where(eq(schema.activityLog.entityId, tenant.id))
            .orderBy(schema.activityLog.at, sql`ctid`);
          expect(
            log.map((e) => [
              e.action,
              e.entityType,
              e.actorUserId,
              e.before?.companyName ?? null,
              e.after?.companyName ?? null,
            ]),
          ).toEqual([
            ["create", "tenants", a.userId, null, "Logged Ltd"],
            ["update", "tenants", a.userId, "Logged Ltd", "Logged Pvt Ltd"],
            ["delete", "tenants", a.userId, "Logged Pvt Ltd", null],
          ]);
        },
      );
    });
  });

  it("logs nothing and returns null when the row belongs to another organization", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async (s) => {
          expect(
            await updateLogged(s, schema.tenants, b.tenant.id, {
              notes: "x",
            }),
          ).toBeNull();
          expect(await deleteLogged(s, schema.tenants, b.tenant.id)).toBe(
            false,
          );
          expect(await s.tx.select().from(schema.activityLog)).toEqual([]);
        },
      );
    });
  });

  it("refuses an entry written in someone else's name", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        async (s) => {
          await expect(
            s.tx.transaction((t) =>
              logActivity(
                { ...s, tx: t, userId: b.userId },
                {
                  entityType: "tenants",
                  entityId: a.tenant.id,
                  action: "update",
                },
              ),
            ),
          ).rejects.toThrow();
        },
      );
    });
  });

  it("can't be changed or deleted, even by the database owner", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        (s) =>
          logActivity(s, {
            entityType: "tenants",
            entityId: a.tenant.id,
            action: "update",
          }),
      );
      await tx.execute(sql`reset role`);
      await expect(
        tx.transaction((t) =>
          t.update(schema.activityLog).set({ action: "delete" }),
        ),
      ).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/can.t be changed/) },
      });
      await expect(
        tx.transaction((t) => t.delete(schema.activityLog)),
      ).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/can.t be changed/) },
      });
    });
  });
});
