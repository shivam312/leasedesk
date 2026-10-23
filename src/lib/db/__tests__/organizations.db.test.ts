import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  actAs,
  closeDb,
  createAuthUser,
  inRollback,
  only,
  skipDbTests,
} from "./harness";

describe.skipIf(skipDbTests)("organization tables", () => {
  afterAll(closeDb);

  it("stores an organization, a membership and a billing entity with empty settings", async () => {
    await inRollback(async (tx) => {
      const userId = await createAuthUser(tx, "owner@example.test");
      const org = only(
        await tx
          .insert(schema.organizations)
          .values({ name: "Test Org" })
          .returning(),
      );
      const member = only(
        await tx
          .insert(schema.memberships)
          .values({
            organizationId: org.id,
            userId,
            email: "owner@example.test",
            role: "owner",
            status: "active",
          })
          .returning(),
      );
      const entity = only(
        await tx
          .insert(schema.billingEntities)
          .values({
            organizationId: org.id,
            legalName: "Test Org Pvt Ltd",
            stateCode: "27",
            address: "Mumbai",
          })
          .returning(),
      );

      expect(org.settings).toEqual({});
      expect(entity.settings).toEqual({});
      expect(member.role).toBe("owner");
    });
  });

  it("refuses a second membership for the same email in one organization", async () => {
    await inRollback(async (tx) => {
      const org = only(
        await tx
          .insert(schema.organizations)
          .values({ name: "Test Org" })
          .returning(),
      );
      const row = {
        organizationId: org.id,
        email: "a@example.test",
        role: "viewer" as const,
      };
      await tx.insert(schema.memberships).values(row);
      await expect(tx.insert(schema.memberships).values(row)).rejects.toThrow();
    });
  });

  it("has row-level security on: a signed-in user with no policy granting access sees nothing", async () => {
    await inRollback(async (tx) => {
      const userId = await createAuthUser(tx, "stranger@example.test");
      await tx.insert(schema.organizations).values({ name: "Hidden Org" });
      await actAs(tx, userId);
      const orgs = await tx.select().from(schema.organizations);
      const entities = await tx.select().from(schema.billingEntities);
      expect(orgs).toEqual([]);
      expect(entities).toEqual([]);
    });
  });
});
