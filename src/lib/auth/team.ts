// Taking someone off the team: removing a member or cancelling an invite.
// The row stays, marked removed, so the activity log still names who did
// what; row-level security only counts active members, so a removed person
// loses access at once. Owners only (memberships' owner_update policy).

import { and, eq, ne } from "drizzle-orm";
import { logActivity } from "@/lib/db/activity-log";
import { memberships } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

/** A removal that isn't allowed, with a message to show as it is. */
export class TeamError extends Error {}

export async function removeMember(
  s: Scoped,
  membershipId: string,
): Promise<{ email: string; kind: "removed" | "invite_cancelled" }> {
  const [row] = await s.tx
    .select()
    .from(memberships)
    .where(s.where(memberships, eq(memberships.id, membershipId)))
    .for("update");
  if (!row || row.status === "removed")
    throw new TeamError("That person isn't on the team any more.");
  if (row.userId === s.userId)
    throw new TeamError(
      "You can't remove yourself. Ask another owner to do it.",
    );
  if (row.status === "active" && row.role === "owner") {
    const others = await s.tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        s.where(
          memberships,
          and(
            eq(memberships.role, "owner"),
            eq(memberships.status, "active"),
            ne(memberships.id, row.id),
          ),
        ),
      );
    if (others.length === 0)
      throw new TeamError("The team needs at least one owner.");
  }
  const kind = row.status === "invited" ? "invite_cancelled" : "removed";
  const [after] = await s.tx
    .update(memberships)
    .set({ status: "removed", inviteTokenHash: null })
    .where(s.where(memberships, eq(memberships.id, row.id)))
    .returning();
  if (!after) throw new TeamError("Only an owner can remove people.");
  await logActivity(s, {
    entityType: "memberships",
    entityId: row.id,
    action: kind === "removed" ? "remove" : "cancel_invite",
    before: { ...row, inviteTokenHash: undefined },
    after: { ...after, inviteTokenHash: undefined },
  });
  return { email: row.email, kind };
}
