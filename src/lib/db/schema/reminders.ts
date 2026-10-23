// Payment reminders (docs/DATA_MODEL.md, Supporting; docs/BILLING_RULES.md
// section 13). One row per reminder sent or attempted. An automatic one
// claims its step (e.g. "after:7") before the email goes, so a retried or
// doubled daily job never sends the same reminder twice. Rows are never
// deleted; the only change is the status, once, from "sending" (drizzle/0022).

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { invoices } from "./invoices";

export const reminderChannel = pgEnum("reminder_channel", [
  "email",
  "whatsapp_link",
]);

export const reminderStatus = pgEnum("reminder_status", [
  // Claimed; the email is going out. Stays so if the send never finished,
  // which is safer than sending twice.
  "sending",
  "sent",
  "failed",
  // The tenant has no email address to send to.
  "no_email",
]);

export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    organizationId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    channel: reminderChannel().notNull(),
    // The automatic schedule step, "before:3" or "after:7"; null when a
    // person sent it.
    step: text(),
    // The amount the reminder asked for, in paise.
    amountAsked: bigint({ mode: "number" }).notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Null when automatic.
    sentBy: uuid(),
    sentTo: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: reminderStatus().notNull().default("sending"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.invoiceId),
    uniqueIndex("reminders_one_per_step")
      .on(t.invoiceId, t.channel, t.step)
      .where(sql`${t.step} is not null`),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }).onDelete("restrict"),
    check("reminders_amount", sql`${t.amountAsked} > 0`),
    check(
      "reminders_step",
      sql`${t.step} is null or ${t.step} ~ '^(before|after):[0-9]+$'`,
    ),
    check("reminders_automatic", sql`${t.step} is null or ${t.sentBy} is null`),
  ],
).enableRLS();
