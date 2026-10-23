"use server";

// The monthly billing run and, later, sending invoices (M4).

import { revalidatePath } from "next/cache";
import { appDb } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { runScoped } from "@/lib/db/scoped";
import { runMonthSchema, runSummary } from "@/lib/invoices/forms";
import { runBilling } from "@/lib/invoices/run";
import { guardedForm } from "./guard";

/** "Make invoices": draft every lease's invoice for the chosen month. */
export async function runBillingNow(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    runMonthSchema,
    form,
    async (member, { month }) => {
      const result = await runScoped(appDb, member, (s) =>
        runBilling(s, month),
      );
      revalidatePath("/billing");
      return runSummary(result);
    },
  );
}
