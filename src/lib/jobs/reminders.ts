// The automatic payment reminders: every morning at 09:00 India time, after
// the 06:00 billing run, email the reminder step due today on each sent,
// unpaid invoice (docs/BILLING_RULES.md section 14).

import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import type { Transactional } from "@/lib/db/scoped";
import { emailDriver } from "@/lib/email";
import { sendDueReminders } from "@/lib/reminders/run";
import { todayInIndia } from "@/lib/today";
import { inngest } from "./inngest";

const appDb = db as unknown as Transactional;

export const dailyReminders = inngest.createFunction(
  {
    id: "daily-payment-reminders",
    triggers: [{ cron: "TZ=Asia/Kolkata 0 9 * * *" }],
  },
  async ({ step }) => {
    const { orgs, today } = await step.run("find organizations", async () => ({
      orgs: await db.select({ id: organizations.id }).from(organizations),
      today: todayInIndia(),
    }));
    const results = [];
    // One step per organization, so a retry doesn't redo the others. A
    // retried step can't email twice: each reminder is claimed once.
    for (const { id } of orgs)
      results.push(
        await step.run(`remind ${id}`, () =>
          sendDueReminders(appDb, id, today, emailDriver()),
        ),
      );
    return results;
  },
);
