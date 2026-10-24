"use server";

// Acting on lease dates from the Today list.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { customDateSchema } from "@/lib/alerts/custom-date-form";
import {
  addCustomDate,
  markDateDone,
  markInDiscussion,
  snoozeDate,
} from "@/lib/alerts/dates";
import { runScoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { todayInIndia } from "@/lib/today";
import { guardedForm } from "./guard";

const dateIdSchema = z.object({ dateId: z.uuid() });

const NOT_FOUND = "That date couldn't be found. Reload the page and try again.";

/** "Mark done": the date leaves the list for good. */
export async function markDateDoneAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_leases",
    dateIdSchema,
    form,
    async (member, { dateId }) => {
      const ok = await runScoped(appDb, member, (s) => markDateDone(s, dateId));
      if (!ok) return { message: NOT_FOUND };
      revalidatePath("/today");
      return { message: "Marked done.", tone: "success" };
    },
  );
}

/** "Remind me later": the date comes back on the list in a week. */
export async function snoozeDateAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_leases",
    dateIdSchema,
    form,
    async (member, { dateId }) => {
      const until = await runScoped(appDb, member, (s) =>
        snoozeDate(s, dateId, todayInIndia()),
      );
      if (!until) return { message: NOT_FOUND };
      revalidatePath("/today");
      return { message: `Hidden until ${formatDate(until)}.`, tone: "success" };
    },
  );
}

/** "In discussion" on a lease end: Today shows it again only near the date. */
export async function markInDiscussionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_leases",
    dateIdSchema,
    form,
    async (member, { dateId }) => {
      const saved = await runScoped(appDb, member, (s) =>
        markInDiscussion(s, dateId),
      );
      if (!saved) return { message: NOT_FOUND };
      revalidatePath("/today");
      return {
        message: `Marked in discussion. It's back on Today from ${formatDate(saved.showsFrom)}.`,
        tone: "success",
      };
    },
  );
}

/** "Add a date" on a lease. */
export async function addCustomDateAction(
  leaseId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_leases",
    customDateSchema,
    form,
    async (member, { label, date, remind }) => {
      if (!z.uuid().safeParse(leaseId).success)
        return { message: "That lease couldn't be found." };
      const saved = await runScoped(appDb, member, (s) =>
        addCustomDate(s, leaseId, { label, date, remindDays: remind }),
      );
      if (!saved) return { message: "That lease couldn't be found." };
      revalidatePath(`/leases/${leaseId}`);
      revalidatePath("/today");
      return {
        message: `Added ${label} on ${formatDate(date)}.`,
        tone: "success",
      };
    },
  );
}
