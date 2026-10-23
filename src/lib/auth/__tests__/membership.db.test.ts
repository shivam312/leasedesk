import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  closeDb,
  createAuthUser,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import type { Transactional } from "@/lib/db/scoped";
import { createOrganizationForOwner, findMember } from "../membership";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("organization at sign-up", () => {
  afterAll(closeDb);

  it("creates the organization with the user as active owner, and logs both", async () => {
    await inRollback(async (tx) => {
      const userId = await createAuthUser(tx, "new@owner.test");
      const member = await createOrganizationForOwner(asDb(tx), {
        userId,
        email: "New@Owner.test",
        organizationName: "Mehta Properties",
      });
      expect(member).toMatchObject({
        userId,
        email: "new@owner.test",
        organizationName: "Mehta Properties",
        role: "owner",
      });
      expect(await findMember(tx, userId)).toEqual(member);
      const log = await tx
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.organizationId, member.organizationId));
      expect(log.map((e) => [e.entityType, e.action, e.actorUserId])).toEqual([
        ["organizations", "create", userId],
        ["memberships", "create", userId],
      ]);
    });
  });

  it("finds no organization for a user without an active membership", async () => {
    await inRollback(async (tx) => {
      const userId = await createAuthUser(tx, "lonely@owner.test");
      expect(await findMember(tx, userId)).toBeNull();
      const member = await createOrganizationForOwner(asDb(tx), {
        userId,
        email: "lonely@owner.test",
        organizationName: "Org",
      });
      await tx
        .update(schema.memberships)
        .set({ status: "removed" })
        .where(eq(schema.memberships.organizationId, member.organizationId));
      expect(await findMember(tx, userId)).toBeNull();
    });
  });
});
