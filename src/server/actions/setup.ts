"use server";

// The setup checklist on Today: marking a step done by hand (owners only,
// like the rest of setup). Logged in the activity log.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/auth/forms";
import { appDb } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { MARKABLE_STEPS } from "@/lib/setup/checklist";
import { markSetupStep } from "@/lib/setup/queries";
import { guardedForm } from "./guard";

export async function markSetupStepAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_settings",
    z.object({ step: z.enum(MARKABLE_STEPS) }),
    form,
    async (member, { step }) => {
      await runScoped(appDb, member, (s) => markSetupStep(s, step));
      revalidatePath("/today");
      return { tone: "success", message: "Done." };
    },
  );
}
