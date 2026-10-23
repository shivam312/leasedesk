// The daily digest for one organization (D36). Like the reminders (D33),
// sending happens in two parts:
//
// 1. In one transaction: build the needs-attention list, work out each
//    member's items, and claim each member's digest for today by inserting
//    its digest_sends row ("sending"). The unique (organization, user, day)
//    index means a digest is claimed once, even if two runs overlap or the
//    job is retried.
// 2. After that commits: email each claimed digest through the adapter and
//    mark it sent or failed. A send that never finishes stays "sending" and
//    is never retried: a missed digest is better than a double one.

import { and, eq, isNotNull } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import { logActivity } from "@/lib/db/activity-log";
import { digestSends, memberships, organizations } from "@/lib/db/schema";
import { runAsSystem, type Scoped, type Transactional } from "@/lib/db/scoped";
import { EmailError, type Email, type EmailDriver } from "@/lib/email";
import { loadSettings } from "@/lib/settings/store";
import { needsAttention } from "./attention";
import { digestEmail, digestsFor } from "./digest";
import { attentionInput } from "./queries";

type Claimed = { digestId: string; email: Email };

export type DigestRunResult = { sent: number; failed: number };

/** Part 1: work out today's digests and claim them. */
export async function claimDigests(
  s: Scoped,
  today: PlainDate,
  appUrl: string | undefined,
): Promise<Claimed[]> {
  const settings = await loadSettings(s);
  if (!settings["alerts.dailyDigest"]) return [];
  const members = await s.tx
    .select({
      userId: memberships.userId,
      email: memberships.email,
      role: memberships.role,
    })
    .from(memberships)
    .where(
      s.where(
        memberships,
        eq(memberships.status, "active"),
        isNotNull(memberships.userId),
      ),
    );
  if (members.length === 0) return [];
  const [org] = await s.tx
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, s.organizationId));
  if (!org) return [];
  const items = needsAttention(await attentionInput(s, today));
  const claimed: Claimed[] = [];
  for (const d of digestsFor(
    members.map((m) => ({ ...m, userId: m.userId! })),
    items,
    today,
  )) {
    const [row] = await s.tx
      .insert(digestSends)
      .values(
        s.values({
          userId: d.member.userId,
          digestDate: today,
          sentTo: d.member.email,
          itemCount: d.items.length,
        }),
      )
      .onConflictDoNothing()
      .returning();
    // Already claimed today, by this run's earlier try or another run.
    if (!row) continue;
    await logActivity(s, {
      entityType: "digest_sends",
      entityId: row.id,
      action: "create",
      after: {
        userId: row.userId,
        digestDate: today,
        sentTo: row.sentTo,
        items: d.items.map((i) => i.key),
      },
    });
    claimed.push({
      digestId: row.id,
      email: digestEmail({
        organizationName: org.name,
        to: d.member.email,
        today,
        items: d.items,
        appUrl,
      }),
    });
  }
  return claimed;
}

/** Part 2: email one claimed digest and record how it went. */
async function deliver(
  database: Transactional,
  organizationId: string,
  claim: Claimed,
  driver: EmailDriver,
): Promise<boolean> {
  let status: "sent" | "failed" = "sent";
  let message: string | undefined;
  try {
    await driver.send(claim.email);
  } catch (error) {
    console.error("Digest email failed", claim.digestId, error);
    status = "failed";
    message =
      error instanceof EmailError
        ? error.message
        : "The email couldn't be sent.";
  }
  await runAsSystem(database, organizationId, async (s) => {
    await s.tx
      .update(digestSends)
      .set({ status })
      .where(
        s.where(
          digestSends,
          and(
            eq(digestSends.id, claim.digestId),
            eq(digestSends.status, "sending"),
          ),
        ),
      );
    await logActivity(s, {
      entityType: "digest_email",
      entityId: claim.digestId,
      action: "send",
      after: { status, to: claim.email.to, message },
    });
  });
  return status === "sent";
}

/**
 * Send one organization's digests for `today`. Run by the daily job
 * (src/lib/jobs/digest.ts) as the system, never from a screen.
 */
export async function sendDigests(
  database: Transactional,
  organizationId: string,
  today: PlainDate,
  driver: EmailDriver,
  appUrl: string | undefined = process.env.APP_URL || undefined,
): Promise<DigestRunResult> {
  const claimed = await runAsSystem(database, organizationId, (s) =>
    claimDigests(s, today, appUrl),
  );
  let sent = 0;
  let failed = 0;
  for (const claim of claimed)
    if (await deliver(database, organizationId, claim, driver)) sent++;
    else failed++;
  return { sent, failed };
}
