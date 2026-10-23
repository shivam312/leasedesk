// The few trusted paths that use the owner database connection instead of
// withOrg (D14): finding a signed-in user's organization, and creating an
// organization at sign-up. Each takes the database (or a test transaction) as
// a parameter so it can be tested against the local stack.

import { and, asc, eq } from "drizzle-orm";
import { toLogJson } from "@/lib/db/activity-log";
import { only } from "@/lib/db/rows";
import { activityLog, memberships, organizations } from "@/lib/db/schema";
import type { Transactional, Tx } from "@/lib/db/scoped";

export type Role = (typeof memberships.role.enumValues)[number];

export interface Member {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: Role;
}

type Reader = Pick<Tx, "select">;

/**
 * The user's organization and role. One organization per user in v1
 * (multi-organization accounts are v2), so the oldest active membership wins.
 */
export async function findMember(
  database: Reader,
  userId: string,
): Promise<Member | null> {
  const [row] = await database
    .select({
      userId: memberships.userId,
      email: memberships.email,
      organizationId: memberships.organizationId,
      organizationName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(eq(memberships.userId, userId), eq(memberships.status, "active")),
    )
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  if (!row?.userId) return null;
  return { ...row, userId: row.userId };
}

/**
 * A new organization with the signed-up user as its owner, and the activity
 * log entries for both, in one transaction.
 */
export async function createOrganizationForOwner(
  database: Transactional,
  input: { userId: string; email: string; organizationName: string },
): Promise<Member> {
  return database.transaction(async (tx) => {
    const org = only(
      await tx
        .insert(organizations)
        .values({ name: input.organizationName })
        .returning(),
    );
    const membership = only(
      await tx
        .insert(memberships)
        .values({
          organizationId: org.id,
          userId: input.userId,
          email: input.email.toLowerCase(),
          role: "owner",
          status: "active",
        })
        .returning(),
    );
    await tx.insert(activityLog).values([
      {
        organizationId: org.id,
        actorUserId: input.userId,
        entityType: "organizations",
        entityId: org.id,
        action: "create",
        after: toLogJson(org),
      },
      {
        organizationId: org.id,
        actorUserId: input.userId,
        entityType: "memberships",
        entityId: membership.id,
        action: "create",
        after: toLogJson(membership),
      },
    ]);
    return {
      userId: input.userId,
      email: membership.email,
      organizationId: org.id,
      organizationName: org.name,
      role: "owner",
    };
  });
}
