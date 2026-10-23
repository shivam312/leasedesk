"use server";

// Settings → Business details: the organization and its billing entities.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appDb } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { insertLogged, logActivity, updateLogged } from "@/lib/db/activity-log";
import { billingEntities, organizations } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import {
  billingEntitySchema,
  organizationSchema,
} from "@/lib/settings/business-forms";
import { guardedForm } from "./guard";

export async function saveOrganization(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_settings",
    organizationSchema,
    form,
    (member, data) =>
      runScoped(appDb, member, async (s) => {
        // organizations is keyed by id, so it doesn't use updateLogged.
        const [before] = await s.tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, s.organizationId));
        const [after] = await s.tx
          .update(organizations)
          .set(data)
          .where(eq(organizations.id, s.organizationId))
          .returning();
        if (!before || !after)
          return { message: "Only an owner can change these settings." };
        await logActivity(s, {
          entityType: "organizations",
          entityId: after.id,
          action: "update",
          before,
          after,
        });
        revalidatePath("/settings/business");
        return { tone: "success", message: "Saved." };
      }),
  );
}

/** Add a billing entity (`id` null) or change one. */
export async function saveBillingEntity(
  id: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await guardedForm(
    "manage_settings",
    billingEntitySchema,
    form,
    (member, data) =>
      runScoped(appDb, member, async (s) => {
        const saved = id
          ? await updateLogged(s, billingEntities, id, data)
          : await insertLogged(s, billingEntities, data);
        if (!saved)
          return { message: "This GSTIN isn't in your account any more." };
        revalidatePath("/settings/business");
        return { tone: "success" as const, message: "Saved." };
      }),
  );
  if (result.tone === "success") redirect("/settings/business");
  return result;
}
