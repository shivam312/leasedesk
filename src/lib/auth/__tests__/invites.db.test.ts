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
import {
  acceptInvite,
  findInvite,
  hashInviteToken,
  InviteError,
  inviteMember,
} from "../invites";
import { findMember } from "../membership";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

async function invite(
  tx: TestTx,
  org: Awaited<ReturnType<typeof seedOrg>>,
  email: string,
  role: "accounts" | "viewer" = "accounts",
) {
  const result = await runScoped(
    asDb(tx),
    { userId: org.userId, organizationId: org.org.id },
    (s) => inviteMember(s, { email, role }),
  );
  // Back to the test's own role for the setup that follows.
  await tx.execute(sql`reset role`);
  return result;
}

describe.skipIf(skipDbTests)("invites", () => {
  afterAll(closeDb);

  it("an owner invites, the person accepts with the invited email and becomes an active member", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      const { token } = await invite(tx, owner, "Accounts@Example.test");

      const open = await findInvite(asDb(tx), token);
      expect(open).toMatchObject({
        email: "accounts@example.test",
        role: "accounts",
        organizationName: "a",
      });

      // Only the hash is stored.
      const [row] = await tx
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.email, "accounts@example.test"));
      expect(row?.inviteTokenHash).toBe(hashInviteToken(token));
      expect(row?.inviteTokenHash).not.toBe(token);

      const userId = await createAuthUser(tx, "accounts@example.test");
      await acceptInvite(asDb(tx), {
        token,
        userId,
        email: "accounts@example.test",
      });
      expect(await findMember(tx, userId)).toMatchObject({
        organizationId: owner.org.id,
        role: "accounts",
      });
      // The link works once.
      expect(await findInvite(asDb(tx), token)).toBeNull();
      await expect(
        acceptInvite(asDb(tx), {
          token,
          userId,
          email: "accounts@example.test",
        }),
      ).rejects.toThrow(InviteError);

      const log = await tx
        .select({ action: schema.activityLog.action })
        .from(schema.activityLog)
        .where(eq(schema.activityLog.entityId, row!.id));
      expect(log.map((e) => e.action).sort()).toEqual(["accept", "invite"]);
    });
  });

  it("refuses a login with a different email", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      const { token } = await invite(tx, owner, "invited@example.test");
      const userId = await createAuthUser(tx, "someone@example.test");
      await expect(
        acceptInvite(asDb(tx), {
          token,
          userId,
          email: "someone@example.test",
        }),
      ).rejects.toThrow(/This invite is for invited@example.test/);
    });
  });

  it("a second invite to the same email replaces the first link", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      const first = await invite(tx, owner, "x@example.test");
      const second = await invite(tx, owner, "x@example.test", "viewer");
      expect(await findInvite(asDb(tx), first.token)).toBeNull();
      expect(await findInvite(asDb(tx), second.token)).toMatchObject({
        role: "viewer",
      });
    });
  });

  it("won't invite someone already in the team", async () => {
    await inRollback(async (tx) => {
      const owner = await seedOrg(tx, "a");
      await expect(invite(tx, owner, "a-owner@example.test")).rejects.toThrow(
        /already in your team/,
      );
    });
  });

  it("only an owner can invite", async () => {
    await inRollback(async (tx) => {
      const accounts = await seedOrg(tx, "a", "accounts");
      await expect(
        runScoped(
          asDb(tx),
          { userId: accounts.userId, organizationId: accounts.org.id },
          (s) =>
            s.tx.transaction((t) =>
              inviteMember(
                { ...s, tx: t },
                { email: "y@example.test", role: "viewer" },
              ),
            ),
        ),
      ).rejects.toThrow();
    });
  });
});
