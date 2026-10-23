"use server";

// Settings → Billing rules, for the organization or one building.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { buildings, organizations } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { shownKeys } from "@/lib/settings/labels";
import { readSettingsForm } from "@/lib/settings/rules-form";
import {
  keysForScope,
  parseStoredSettings,
  type StoredSettings,
} from "@/lib/settings/schema";
import { loadSettings, saveSettings } from "@/lib/settings/store";
import { applyReminderDays } from "@/lib/alerts/dates";
import { guardedForm } from "./guard";

export async function saveBillingRules(
  buildingId: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const scope = buildingId ? "building" : "organization";
  const keys = shownKeys(scope, keysForScope);
  return guardedForm("manage_settings", z.unknown(), form, (member) => {
    const read = readSettingsForm(scope, keys, form);
    if ("errors" in read) {
      return Promise.resolve({
        fieldErrors: read.errors,
        values: Object.fromEntries(
          [...form.entries()].map(([k, v]) => [k, String(v)]),
        ),
      });
    }
    return runScoped(appDb, member, async (s) => {
      // Keep stored keys this page doesn't show (reminders, numbering, …).
      const [row] = buildingId
        ? await s.tx
            .select({ settings: buildings.settings })
            .from(buildings)
            .where(s.where(buildings, eq(buildings.id, buildingId)))
        : await s.tx
            .select({ settings: organizations.settings })
            .from(organizations)
            .where(eq(organizations.id, s.organizationId));
      if (!row) return { message: "This building isn't in your account." };
      const kept = Object.fromEntries(
        Object.entries(parseStoredSettings(scope, row.settings)).filter(
          ([k]) => !(keys as string[]).includes(k),
        ),
      ) as StoredSettings;
      await saveSettings(
        s,
        buildingId
          ? { scope: "building", id: buildingId }
          : { scope: "organization" },
        { ...kept, ...read.values },
      );
      // Lease dates keep their own reminder days; bring them in line.
      if (!buildingId) await applyReminderDays(s, await loadSettings(s));
      revalidatePath("/settings/billing-rules", "layout");
      revalidatePath("/today");
      return {
        tone: "success",
        message:
          "Saved. Invoices you make from now on use these rules; sent invoices don't change. If this month's invoices are already made, make them again before sending.",
      };
    });
  });
}
