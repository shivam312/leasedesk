"use server";

// "Run now": the daily jobs for this organization, by hand, when the
// schedule has stopped (job health).

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { FormState } from "@/lib/auth/forms";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { runAsSystem, type Transactional } from "@/lib/db/scoped";
import { emailDriver } from "@/lib/email";
import { runBilling } from "@/lib/invoices/run";
import { dueRuns } from "@/lib/jobs/due-runs";
import { recordedRun } from "@/lib/jobs/health";
import { reportError } from "@/lib/monitoring";
import { sendDueReminders } from "@/lib/reminders/run";
import { todayInIndia } from "@/lib/today";
import { guardedForm } from "./guard";

const systemDb = db as unknown as Transactional;

export async function runDailyNow(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_billing", z.object({}), form, async (member) => {
    const today = todayInIndia();
    const id = member.organizationId;
    try {
      const [org] = await db
        .select({ id: organizations.id, settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, id));
      const due = org ? dueRuns([org], today)[0] : undefined;
      await recordedRun(
        systemDb,
        id,
        "billing",
        today,
        async () =>
          due
            ? runAsSystem(systemDb, id, (s) => runBilling(s, due.month))
            : null,
        "run_now",
      );
      await recordedRun(
        systemDb,
        id,
        "reminders",
        today,
        () => sendDueReminders(systemDb, id, today, emailDriver()),
        "run_now",
      );
    } catch (error) {
      reportError("Run now failed", error, { organizationId: id });
      return {
        message:
          "The daily run stopped with an error. Try again in a few minutes; if it keeps happening, contact support.",
      };
    }
    revalidatePath("/today");
    revalidatePath("/settings");
    return {
      tone: "success",
      message:
        "Done: invoices due today are made, and reminders due today are sent.",
    };
  });
}
