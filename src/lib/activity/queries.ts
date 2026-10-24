// A record's history from activity_log, newest first, with who did each.

import { and, desc, eq, inArray } from "drizzle-orm";
import { activityLog, memberships } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

export async function activityFor(
  s: Scoped,
  entityIds: readonly string[],
  limit = 25,
) {
  if (entityIds.length === 0) return [];
  return s.tx
    .select({
      id: activityLog.id,
      entityType: activityLog.entityType,
      action: activityLog.action,
      before: activityLog.before,
      after: activityLog.after,
      at: activityLog.at,
      who: memberships.email,
    })
    .from(activityLog)
    .leftJoin(
      memberships,
      and(
        eq(memberships.userId, activityLog.actorUserId),
        eq(memberships.organizationId, activityLog.organizationId),
      ),
    )
    .where(s.where(activityLog, inArray(activityLog.entityId, [...entityIds])))
    .orderBy(desc(activityLog.at))
    .limit(limit);
}
