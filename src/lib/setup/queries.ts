// What the setup checklist reads (src/lib/setup/checklist.ts), and marking a
// step done by hand, which is written to the activity log.

import { and, asc, count, eq, ne } from "drizzle-orm";
import { logActivity } from "@/lib/db/activity-log";
import {
  activityLog,
  billingEntities,
  leases,
  memberships,
  openingBalances,
  tenants,
  units,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import type { MarkableStep, SetupFacts } from "./checklist";

const howMany = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

export async function setupFacts(s: Scoped): Promise<SetupFacts> {
  const [
    businesses,
    unitCount,
    leaseRows,
    tenantCount,
    openingCount,
    teamCount,
    marks,
  ] = await Promise.all([
    howMany(
      s.tx
        .select({ n: count() })
        .from(billingEntities)
        .where(s.where(billingEntities)),
    ),
    howMany(s.tx.select({ n: count() }).from(units).where(s.where(units))),
    s.tx
      .select({ id: leases.id })
      .from(leases)
      .where(s.where(leases, ne(leases.status, "draft")))
      .orderBy(asc(leases.createdAt))
      .limit(1),
    howMany(s.tx.select({ n: count() }).from(tenants).where(s.where(tenants))),
    howMany(
      s.tx
        .select({ n: count() })
        .from(openingBalances)
        .where(s.where(openingBalances)),
    ),
    howMany(
      s.tx
        .select({ n: count() })
        .from(memberships)
        .where(s.where(memberships, ne(memberships.status, "removed"))),
    ),
    s.tx
      .select({ after: activityLog.after })
      .from(activityLog)
      .where(
        s.where(
          activityLog,
          and(
            eq(activityLog.entityType, "setup"),
            eq(activityLog.action, "setup_done"),
          ),
        ),
      ),
  ]);
  return {
    hasBusiness: businesses > 0,
    unitCount,
    leaseCount: leaseRows.length,
    firstLeaseId: leaseRows[0]?.id ?? null,
    tenantCount,
    openingBalanceCount: openingCount,
    teamCount,
    marked: marks
      .map((m) => (m.after as { step?: unknown } | null)?.step)
      .filter((v): v is string => typeof v === "string"),
  };
}

/**
 * "Yes, the schedule is right", "Nobody owes anything" (or "The rest owe
 * nothing"), "Just me for now".
 */
export async function markSetupStep(s: Scoped, step: MarkableStep) {
  await logActivity(s, {
    entityType: "setup",
    entityId: s.organizationId,
    action: "setup_done",
    after: { step },
  });
}
