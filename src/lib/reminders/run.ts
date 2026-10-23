// The daily automatic payment reminders for one organization
// (docs/BILLING_RULES.md section 14). Sending happens in two parts, like
// sending invoices:
//
// 1. In one transaction: work out which sent invoices have a reminder step
//    due today, and claim each by inserting its reminder row ("sending").
//    The unique (invoice, channel, step) index means a step is claimed once,
//    even if two runs overlap or the job is retried.
// 2. After that commits: email each claimed reminder through the adapter and
//    mark it sent or failed. A send that never finishes stays "sending" and
//    is never retried: a missed reminder is better than a double one.

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import { logActivity } from "@/lib/db/activity-log";
import { invoices, reminders } from "@/lib/db/schema";
import { runAsSystem, type Scoped, type Transactional } from "@/lib/db/scoped";
import { EmailError, type Email, type EmailDriver } from "@/lib/email";
import { getInvoiceDocument } from "@/lib/invoices/queries";
import { recipientsFor } from "@/lib/invoices/send";
import { unpaidInvoices } from "@/lib/payments/payments";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { todayInIndia } from "@/lib/today";
import { reminderEmail } from "./email";
import { reminderToSend } from "./schedule";

type Claimed = { reminderId: string; invoiceId: string; email: Email };

export type ReminderRunResult = {
  sent: number;
  failed: number;
  /** Due, but the tenant has no email address. */
  noEmail: number;
};

/** The reminder steps already used on each invoice, by channel email. */
async function stepsSent(s: Scoped, invoiceIds: string[]) {
  const map = new Map<string, string[]>();
  if (invoiceIds.length === 0) return map;
  const rows = await s.tx
    .select({ invoiceId: reminders.invoiceId, step: reminders.step })
    .from(reminders)
    .where(
      s.where(
        reminders,
        inArray(reminders.invoiceId, invoiceIds),
        eq(reminders.channel, "email"),
        isNotNull(reminders.step),
      ),
    );
  for (const r of rows)
    map.set(r.invoiceId, [...(map.get(r.invoiceId) ?? []), r.step!]);
  return map;
}

/** Part 1: find the reminders due today and claim them. */
export async function claimDueReminders(
  s: Scoped,
  today: PlainDate,
): Promise<{ claimed: Claimed[]; noEmail: number }> {
  const org = await loadSettings(s);
  const beforeDueDays = org["reminders.beforeDueDays"];
  const afterDueDays = org["reminders.afterDueDays"];
  const claimed: Claimed[] = [];
  let noEmail = 0;
  if (beforeDueDays.length === 0 && afterDueDays.length === 0)
    return { claimed, noEmail };

  const open = await s.tx
    .selectDistinct({ tenantId: invoices.tenantId })
    .from(invoices)
    .where(
      s.where(
        invoices,
        inArray(invoices.status, ["sent", "part_paid", "overdue"]),
      ),
    );
  for (const { tenantId } of open) {
    const settings = await loadSettings(s, { tenantId });
    if (!settings["reminders.autoSend"]) continue;
    const unpaid = await unpaidInvoices(s, tenantId, billingSettings(settings));
    if (unpaid.length === 0) continue;
    const sentAt = new Map(
      (
        await s.tx
          .select({ id: invoices.id, sentAt: invoices.sentAt })
          .from(invoices)
          .where(
            s.where(
              invoices,
              inArray(
                invoices.id,
                unpaid.map((u) => u.id),
              ),
            ),
          )
      ).map((r) => [r.id, r.sentAt]),
    );
    const sent = await stepsSent(
      s,
      unpaid.map((u) => u.id),
    );
    let to: string[] | undefined;
    for (const inv of unpaid) {
      const at = sentAt.get(inv.id);
      if (!at) continue;
      const due = reminderToSend({
        sentOn: todayInIndia(at),
        dueDate: inv.dueDate,
        today,
        beforeDueDays,
        afterDueDays,
        sent: sent.get(inv.id) ?? [],
        outstandingPaise: inv.outstandingPaise,
        expectedTdsPaise: inv.expectedTdsPaise,
      });
      if (!due) continue;
      to ??= await recipientsFor(s, tenantId);
      const [row] = await s.tx
        .insert(reminders)
        .values(
          s.values({
            invoiceId: inv.id,
            channel: "email" as const,
            step: due.step,
            amountAsked: due.amountPaise,
            sentTo: to,
            status:
              to.length > 0 ? ("sending" as const) : ("no_email" as const),
          }),
        )
        .onConflictDoNothing()
        .returning();
      // Claimed by another run a moment ago.
      if (!row) continue;
      await logActivity(s, {
        entityType: "reminders",
        entityId: row.id,
        action: "create",
        after: {
          invoiceId: inv.id,
          step: due.step,
          amountAsked: due.amountPaise,
          sentTo: to,
          status: row.status,
        },
      });
      if (to.length === 0) {
        noEmail++;
        continue;
      }
      const doc = await getInvoiceDocument(s, inv.id);
      if (!doc) continue;
      claimed.push({
        reminderId: row.id,
        invoiceId: inv.id,
        email: reminderEmail(doc, {
          to,
          kind: due.kind,
          today,
          dueDate: inv.dueDate,
          amountPaise: due.amountPaise,
        }),
      });
    }
  }
  return { claimed, noEmail };
}

/** Part 2: email one claimed reminder and record how it went. */
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
    console.error("Reminder email failed", claim.invoiceId, error);
    status = "failed";
    message =
      error instanceof EmailError
        ? error.message
        : "The email couldn't be sent.";
  }
  await runAsSystem(database, organizationId, async (s) => {
    await s.tx
      .update(reminders)
      .set({ status })
      .where(
        s.where(
          reminders,
          and(
            eq(reminders.id, claim.reminderId),
            eq(reminders.status, "sending"),
          ),
        ),
      );
    await logActivity(s, {
      entityType: "reminder_email",
      entityId: claim.reminderId,
      action: "send",
      after: { status, to: claim.email.to, message },
    });
  });
  return status === "sent";
}

/**
 * Send one organization's automatic reminders for `today`. Run by the daily
 * job (src/lib/jobs/reminders.ts) as the system, never from a screen.
 */
export async function sendDueReminders(
  database: Transactional,
  organizationId: string,
  today: PlainDate,
  driver: EmailDriver,
): Promise<ReminderRunResult> {
  const { claimed, noEmail } = await runAsSystem(
    database,
    organizationId,
    (s) => claimDueReminders(s, today),
  );
  let sent = 0;
  let failed = 0;
  for (const claim of claimed)
    if (await deliver(database, organizationId, claim, driver)) sent++;
    else failed++;
  return { sent, failed, noEmail };
}
