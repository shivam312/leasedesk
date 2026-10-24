import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  createAuthUser,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { findInvite, inviteMember } from "../invites";
import { findMember } from "../membership";
import { removeMember, TeamError } from "../team";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

async function asOwner<T>(
  tx: TestTx,
  org: Awaited<ReturnType<typeof seedOrg>>,
  fn: Parameters<typeof runScoped<T>>[2],
) {
  const result = await runScoped(
    asDb(tx),
    { userId: org.userId, organizationId: org.org.id },
    fn,
  );
  await tx.execute(sql`reset role`);
  return result;
}

describe.skipIf(skipDbTests)("removing people from the team", () => {
  afterAll(closeDb);

  it("cancels an invite, so its link stops working", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      const { token } = await asOwner(tx, owner, (s) =>
        inviteMember(s, { email: "new@example.test", role: "viewer" }),
      );
      const [row] = await tx
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.email, "new@example.test"));
      expect(await asOwner(tx, owner, (s) => removeMember(s, row!.id))).toEqual(
        { email: "new@example.test", kind: "invite_cancelled" },
      );
      expect(await findInvite(asDb(tx), token)).toBeNull();
    });
  });

  it("removes an active member, who loses access, and logs it", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      const userId = await createAuthUser(tx, "acc@example.test");
      const [row] = await tx
        .insert(schema.memberships)
        .values({
          organizationId: owner.org.id,
          userId,
          email: "acc@example.test",
          role: "accounts",
          status: "active",
        })
        .returning();
      expect(await findMember(tx, userId)).not.toBeNull();
      await asOwner(tx, owner, (s) => removeMember(s, row!.id));
      expect(await findMember(tx, userId)).toBeNull();
      const logged = await tx
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.entityId, row!.id));
      expect(logged.map((l) => l.action)).toContain("remove");
    });
  });

  it("refuses to remove yourself, so a team always keeps the owner doing it", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      const [self] = await tx
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.userId, owner.userId));
      await expect(
        asOwner(tx, owner, (s) => removeMember(s, self!.id)),
      ).rejects.toThrow(TeamError);
    });
  });
});
