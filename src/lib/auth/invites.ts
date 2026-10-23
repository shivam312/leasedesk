// Inviting people to an organization and accepting an invite.
//
// The owner gets a link to share (WhatsApp or email); there is no invite email
// until the email adapter exists (M4). Only a SHA-256 hash of the link's token
// is stored. Accepting is one of the trusted paths that use the owner
// connection (D14): the person isn't a member yet, so row-level security
// would hide the invite from them.

import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { logActivity, toLogJson } from "@/lib/db/activity-log";
import { activityLog, memberships, organizations } from "@/lib/db/schema";
import type { Scoped, Transactional } from "@/lib/db/scoped";
import type { Role } from "./membership";

/** A problem to show the user as it is. */
export class InviteError extends Error {}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

/**
 * Invite `email` to the current organization with `role`, or send a fresh link
 * to someone already invited or previously removed. Returns the token for the
 * link; only its hash is kept. Row-level security lets only owners do this.
 */
export async function inviteMember(
  s: Scoped,
  input: { email: string; role: Role },
): Promise<{ token: string }> {
  const email = input.email.trim().toLowerCase();
  const { token, hash } = newToken();
  const [existing] = await s.tx
    .select()
    .from(memberships)
    .where(s.where(memberships, eq(memberships.email, email)));

  if (existing?.status === "active") {
    throw new InviteError(`${email} is already in your team.`);
  }
  const values = {
    role: input.role,
    status: "invited" as const,
    invitedBy: s.userId,
    inviteTokenHash: hash,
  };
  const [row] = existing
    ? await s.tx
        .update(memberships)
        .set(values)
        .where(s.where(memberships, eq(memberships.id, existing.id)))
        .returning()
    : await s.tx
        .insert(memberships)
        .values(s.values({ ...values, email }))
        .returning();
  if (!row) throw new InviteError("Only an owner can invite people.");
  await logActivity(s, {
    entityType: "memberships",
    entityId: row.id,
    action: "invite",
    before: existing ? { ...existing, inviteTokenHash: undefined } : null,
    after: { ...row, inviteTokenHash: undefined },
  });
  return { token };
}

export interface OpenInvite {
  membershipId: string;
  email: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

/** The open invite for a link's token, or null if it's unknown or already used. */
export async function findInvite(
  database: Transactional,
  token: string,
): Promise<OpenInvite | null> {
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({
        membershipId: memberships.id,
        email: memberships.email,
        role: memberships.role,
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(organizations.id, memberships.organizationId),
      )
      .where(
        and(
          eq(memberships.inviteTokenHash, hashInviteToken(token)),
          eq(memberships.status, "invited"),
        ),
      );
    return row ?? null;
  });
}

/**
 * Make the signed-in user an active member through the invite. The login's
 * email must be the invited email. One organization per person in v1.
 */
export async function acceptInvite(
  database: Transactional,
  input: { token: string; userId: string; email: string },
): Promise<OpenInvite> {
  return database.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.inviteTokenHash, hashInviteToken(input.token)),
          eq(memberships.status, "invited"),
        ),
      )
      .for("update");
    if (!invite) {
      throw new InviteError(
        "This invite link doesn't work any more. Invite links work once; ask whoever invited you to send a new invite.",
      );
    }
    if (invite.email !== input.email.toLowerCase()) {
      throw new InviteError(
        `This invite is for ${invite.email}. Log in with that email to accept it.`,
      );
    }
    const [elsewhere] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.userId),
          eq(memberships.status, "active"),
        ),
      );
    if (elsewhere) {
      throw new InviteError(
        "Your login already belongs to another organization. Use a different email for this one.",
      );
    }
    const [accepted] = await tx
      .update(memberships)
      .set({ userId: input.userId, status: "active", inviteTokenHash: null })
      .where(eq(memberships.id, invite.id))
      .returning();
    const [org] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invite.organizationId));
    if (!accepted || !org) throw new InviteError("Something went wrong.");
    await tx.insert(activityLog).values({
      organizationId: invite.organizationId,
      actorUserId: input.userId,
      entityType: "memberships",
      entityId: invite.id,
      action: "accept",
      before: toLogJson({ status: invite.status, userId: invite.userId }),
      after: toLogJson({ status: accepted.status, userId: accepted.userId }),
    });
    return {
      membershipId: accepted.id,
      email: accepted.email,
      role: accepted.role,
      organizationId: accepted.organizationId,
      organizationName: org.name,
    };
  });
}
