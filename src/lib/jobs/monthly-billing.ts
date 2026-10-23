// The scheduled billing run: every morning at 06:00 India time, make the
// drafts for each organization whose run day it is (D22, D23). The same
// runBilling is behind the Billing page's "Make invoices" button.

import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { runAsSystem, type Transactional } from "@/lib/db/scoped";
import { runBilling } from "@/lib/invoices/run";
import { todayInIndia } from "@/lib/today";
import { dueRuns } from "./due-runs";
import { inngest } from "./inngest";

const appDb = db as unknown as Transactional;

export const monthlyBilling = inngest.createFunction(
  {
    id: "monthly-billing-run",
    triggers: [{ cron: "TZ=Asia/Kolkata 0 6 * * *" }],
  },
  async ({ step }) => {
    const runs = await step.run("find organizations to bill", async () => {
      const orgs = await db
        .select({ id: organizations.id, settings: organizations.settings })
        .from(organizations);
      return dueRuns(orgs, todayInIndia());
    });
    const results = [];
    // One step per organization, so a retry doesn't redo the others.
    for (const { organizationId, month } of runs)
      results.push(
        await step.run(`bill ${organizationId} for ${month}`, () =>
          runAsSystem(appDb, organizationId, (s) => runBilling(s, month)),
        ),
      );
    return results;
  },
);
