// The scheduled billing run: every morning at 06:00 India time, make the
// drafts for each organization whose run day it is (D22, D23). The same
// runBilling is behind the Billing page's "Make invoices" button.

import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { runAsSystem, type Transactional } from "@/lib/db/scoped";
import { runBilling } from "@/lib/invoices/run";
import { todayInIndia } from "@/lib/today";
import { dueRuns } from "./due-runs";
import { recordedRun } from "./health";
import { inngest } from "./inngest";

const appDb = db as unknown as Transactional;

export const monthlyBilling = inngest.createFunction(
  {
    id: "monthly-billing-run",
    triggers: [{ cron: "TZ=Asia/Kolkata 0 6 * * *" }],
  },
  async ({ step }) => {
    const { orgs, runs, today } = await step.run(
      "find organizations to bill",
      async () => {
        const orgs = await db
          .select({ id: organizations.id, settings: organizations.settings })
          .from(organizations);
        const today = todayInIndia();
        return {
          orgs: orgs.map((o) => o.id),
          runs: dueRuns(orgs, today),
          today,
        };
      },
    );
    const results = [];
    // One step per organization, so a retry doesn't redo the others. Every
    // organization's check is recorded, billed today or not (job health).
    for (const organizationId of orgs) {
      const month = runs.find(
        (r) => r.organizationId === organizationId,
      )?.month;
      results.push(
        await step.run(
          `bill ${organizationId}${month ? ` for ${month}` : ""}`,
          () =>
            recordedRun(appDb, organizationId, "billing", today, async () =>
              month
                ? runAsSystem(appDb, organizationId, (s) =>
                    runBilling(s, month),
                  )
                : null,
            ),
        ),
      );
    }
    return results;
  },
);
