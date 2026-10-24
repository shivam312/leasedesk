// "Remind all" on Today: one reminder email, now, to every tenant with an
// overdue invoice, for their oldest one (as the Today card), asking for what
// is left on that invoice less the TDS they may keep back (section 14), not
// the tenant's total across invoices. A tenant already reminded by a person
// today is skipped, so a second tap sends nothing twice; tenants with no
// email address are listed instead.

import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { overdueByTenant } from "@/lib/alerts/attention";
import { openInvoiceRows } from "@/lib/alerts/queries";
import type { PlainDate } from "@/lib/billing/dates";
import { insertLogged, logActivity } from "@/lib/db/activity-log";
import { reminders } from "@/lib/db/schema";
import {
  runScoped,
  type OrgContext,
  type Transactional,
} from "@/lib/db/scoped";
import { EmailError, type Email, type EmailDriver } from "@/lib/email";
import { getInvoiceDocument } from "@/lib/invoices/queries";
import { recipientsFor } from "@/lib/invoices/send";
import { reportError } from "@/lib/monitoring";
import { reminderEmail } from "./email";

export type RemindAllResult = {
  sent: string[];
  failed: string[];
  noEmail: string[];
  /** Reminded by a person earlier today. */
  alreadyToday: string[];
};

/** Midnight in India on `today`, as an instant. */
const startOfIndiaDay = (today: PlainDate) =>
  new Date(`${today}T00:00:00+05:30`);

export async function remindAllOverdue(
  db: Transactional,
  ctx: OrgContext,
  today: PlainDate,
  driver: EmailDriver,
): Promise<RemindAllResult> {
  const result: RemindAllResult = {
    sent: [],
    failed: [],
    noEmail: [],
    alreadyToday: [],
  };
  // Part 1: claim one reminder per overdue tenant, in one transaction.
  const claims = await runScoped(db, ctx, async (s) => {
    const late = overdueByTenant(await openInvoiceRows(s), today);
    if (late.length === 0) return [];
    const earlier = new Set(
      (
        await s.tx
          .select({ invoiceId: reminders.invoiceId })
          .from(reminders)
          .where(
            s.where(
              reminders,
              inArray(
                reminders.invoiceId,
                late.map((t) => t.oldestInvoiceId),
              ),
              eq(reminders.channel, "email"),
              isNull(reminders.step),
              gte(reminders.createdAt, startOfIndiaDay(today)),
            ),
          )
      ).map((r) => r.invoiceId),
    );
    const out: {
      id: string;
      tenant: string;
      invoiceId: string;
      email: Email;
    }[] = [];
    for (const t of late) {
      if (earlier.has(t.oldestInvoiceId)) {
        result.alreadyToday.push(t.tenantName);
        continue;
      }
      const to = await recipientsFor(s, t.tenantId);
      const doc =
        to.length > 0 ? await getInvoiceDocument(s, t.oldestInvoiceId) : null;
      if (!doc) {
        result.noEmail.push(t.tenantName);
        continue;
      }
      const row = await insertLogged(s, reminders, {
        invoiceId: t.oldestInvoiceId,
        channel: "email",
        step: null,
        amountAsked: t.oldestAmountPaise,
        sentBy: s.userId,
        sentTo: to,
        status: "sending",
      });
      out.push({
        id: row.id,
        tenant: t.tenantName,
        invoiceId: t.oldestInvoiceId,
        email: reminderEmail(doc, {
          to,
          kind: "after",
          today,
          dueDate: t.oldestDueDate,
          amountPaise: t.oldestAmountPaise,
        }),
      });
    }
    return out;
  });
  // Part 2: email each and record how it went.
  for (const c of claims) {
    let status: "sent" | "failed" = "sent";
    let message: string | undefined;
    try {
      await driver.send(c.email);
    } catch (error) {
      reportError("Reminder email failed", error, { invoiceId: c.invoiceId });
      status = "failed";
      message =
        error instanceof EmailError
          ? error.message
          : "The email couldn't be sent.";
    }
    await runScoped(db, ctx, async (s) => {
      await s.tx
        .update(reminders)
        .set({ status })
        .where(
          s.where(
            reminders,
            and(eq(reminders.id, c.id), eq(reminders.status, "sending")),
          ),
        );
      await logActivity(s, {
        entityType: "reminder_email",
        entityId: c.id,
        action: "send",
        after: { status, to: c.email.to, message },
      });
    });
    (status === "sent" ? result.sent : result.failed).push(c.tenant);
  }
  return result;
}

/** What "Remind all" did, in a sentence or two. */
export function remindAllMessage(r: RemindAllResult): string {
  const names = (list: string[]) => list.join(", ");
  const parts: string[] = [];
  if (r.sent.length)
    parts.push(
      `Emailed a reminder to ${r.sent.length} ${r.sent.length === 1 ? "tenant" : "tenants"}.`,
    );
  if (r.failed.length)
    parts.push(`Couldn't email ${names(r.failed)}; try again later.`);
  if (r.noEmail.length)
    parts.push(
      `No email address for ${names(r.noEmail)}: add one on the tenant's page, or remind them on WhatsApp.`,
    );
  if (r.alreadyToday.length)
    parts.push(`Already reminded today: ${names(r.alreadyToday)}.`);
  return parts.join(" ") || "Nobody is overdue, so there's no one to remind.";
}
