// Job health: each daily job records a run per organization (job_runs), and
// Today and Settings warn when the billing check hasn't run for more than a
// day, so a stopped scheduler is noticed before invoices are missed.

import { and, desc, eq } from "drizzle-orm";
import { daysFrom } from "@/lib/alerts/attention";
import type { PlainDate } from "@/lib/billing/dates";
import { todayInIndia } from "@/lib/today";
import { jobRuns, organizations } from "@/lib/db/schema";
import { runAsSystem, type Scoped, type Transactional } from "@/lib/db/scoped";

export type JobName = "billing" | "reminders" | "digest";

/**
 * The date the daily run is late since, or null if it's on time: it last ran
 * (or, never having run, the organization started) more than a day before
 * today. The run is at 06:00, so yesterday's run is still on time.
 */
export function dailyRunLateSince(
  lastRun: PlainDate | null,
  startedOn: PlainDate,
  today: PlainDate,
): PlainDate | null {
  const since = lastRun ?? startedOn;
  return daysFrom(since, today) > 1 ? since : null;
}

/** Record one job's run for an organization (as the database owner). */
export async function recordJobRun(
  db: Transactional,
  organizationId: string,
  run: {
    job: JobName;
    runDate: PlainDate;
    ok: boolean;
    error?: string | null;
    source?: "schedule" | "run_now";
  },
) {
  await runAsSystem(db, organizationId, (s) =>
    s.tx.insert(jobRuns).values(
      s.values({
        job: run.job,
        runDate: run.runDate,
        ok: run.ok,
        error: run.error ?? null,
        source: run.source ?? "schedule",
      }),
    ),
  );
}

/** The last day the daily billing check finished for this organization. */
export async function lastBillingRun(s: Scoped): Promise<PlainDate | null> {
  const [row] = await s.tx
    .select({ runDate: jobRuns.runDate })
    .from(jobRuns)
    .where(
      s.where(jobRuns, and(eq(jobRuns.job, "billing"), eq(jobRuns.ok, true))),
    )
    .orderBy(desc(jobRuns.runDate))
    .limit(1);
  return row?.runDate ?? null;
}

/**
 * Run a job for one organization and record how it went; a failure is
 * recorded, then thrown again so the scheduler retries it.
 */
export async function recordedRun<T>(
  db: Transactional,
  organizationId: string,
  job: JobName,
  runDate: PlainDate,
  fn: () => Promise<T>,
  source: "schedule" | "run_now" = "schedule",
): Promise<T> {
  try {
    const result = await fn();
    await recordJobRun(db, organizationId, { job, runDate, ok: true, source });
    return result;
  } catch (error) {
    await recordJobRun(db, organizationId, {
      job,
      runDate,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      source,
    });
    throw error;
  }
}

/** The date this organization's daily run is late since, or null (Today and Settings). */
export async function dailyRunLate(
  s: Scoped,
  today: PlainDate,
): Promise<PlainDate | null> {
  const [org] = await s.tx
    .select({ createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, s.organizationId));
  if (!org) return null;
  return dailyRunLateSince(
    await lastBillingRun(s),
    todayInIndia(org.createdAt),
    today,
  );
}
