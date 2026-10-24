// The daily digest: every morning at 08:00 India time, after the 06:00
// billing run, email each person on the team their items from Today (D36).

import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import type { Transactional } from "@/lib/db/scoped";
import { sendDigests } from "@/lib/alerts/digest-run";
import { emailDriver } from "@/lib/email";
import { todayInIndia } from "@/lib/today";
import { recordedRun } from "./health";
import { inngest } from "./inngest";

const appDb = db as unknown as Transactional;

export const dailyDigest = inngest.createFunction(
  {
    id: "daily-digest",
    triggers: [{ cron: "TZ=Asia/Kolkata 0 8 * * *" }],
  },
  async ({ step }) => {
    const { orgs, today } = await step.run("find organizations", async () => ({
      orgs: await db.select({ id: organizations.id }).from(organizations),
      today: todayInIndia(),
    }));
    const results = [];
    // One step per organization, so a retry doesn't redo the others. A
    // retried step can't email twice: each person's digest is claimed once.
    for (const { id } of orgs)
      results.push(
        await step.run(`digest ${id}`, () =>
          recordedRun(appDb, id, "digest", today, () =>
            sendDigests(appDb, id, today, emailDriver()),
          ),
        ),
      );
    return results;
  },
);
