// Reading reminders for screens.

import { asc, eq } from "drizzle-orm";
import { reminders } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

/** The reminders sent about an invoice, oldest first. */
export async function remindersFor(s: Scoped, invoiceId: string) {
  return s.tx
    .select()
    .from(reminders)
    .where(s.where(reminders, eq(reminders.invoiceId, invoiceId)))
    .orderBy(asc(reminders.sentAt), asc(reminders.id));
}
