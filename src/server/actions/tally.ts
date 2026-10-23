"use server";

// Settings → Tally: the ledger names used in the Tally file.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { organizations, tenants } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { readLedgerForm } from "@/lib/exports/tally-form";
import { parseStoredSettings } from "@/lib/settings/schema";
import { saveSettings } from "@/lib/settings/store";
import { guardedForm } from "./guard";

export async function saveTallyLedgers(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_settings", z.unknown(), form, (member) =>
    runScoped(appDb, member, async (s) => {
      const tenantRows = await s.tx
        .select({ id: tenants.id, settings: tenants.settings })
        .from(tenants)
        .where(s.where(tenants));
      const read = readLedgerForm(
        form,
        tenantRows.map((t) => t.id),
      );
      if ("errors" in read)
        return {
          fieldErrors: read.errors,
          values: Object.fromEntries(
            [...form.entries()].map(([k, v]) => [k, String(v)]),
          ),
        };
      const [org] = await s.tx
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, s.organizationId));
      if (!org) return { message: "Your account couldn't be found." };
      // Keep every other stored setting.
      await saveSettings(
        s,
        { scope: "organization" },
        {
          ...parseStoredSettings("organization", org.settings),
          ...read.organization,
        },
      );
      for (const t of tenantRows) {
        const stored = parseStoredSettings("tenant", t.settings);
        const name = read.parties.get(t.id) ?? "";
        if ((stored["tally.partyLedger"] ?? "") === name) continue;
        const next = { ...stored };
        delete next["tally.partyLedger"];
        await saveSettings(
          s,
          { scope: "tenant", id: t.id },
          name ? { ...next, "tally.partyLedger": name } : next,
        );
      }
      revalidatePath("/settings/tally");
      revalidatePath("/reports/tally");
      return {
        tone: "success",
        message:
          "Saved. The next Tally file uses these ledger names; files already downloaded don't change.",
      };
    }),
  );
}
