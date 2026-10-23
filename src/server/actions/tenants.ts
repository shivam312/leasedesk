"use server";

// Tenants and their contacts.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appDb } from "@/lib/auth";
import { parseForm, type FormState } from "@/lib/auth/forms";
import { insertLogged, updateLogged } from "@/lib/db/activity-log";
import { tenantContacts, tenants } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { parseStoredSettings } from "@/lib/settings/schema";
import { saveSettings } from "@/lib/settings/store";
import { contactSchema, tenantSchema, withAutoSend } from "@/lib/tenants/forms";
import { guardedForm } from "./guard";

/** The contact fields of the new-tenant form, prefixed "contact_". */
function contactPart(form: FormData): FormData {
  const part = new FormData();
  for (const [k, v] of form.entries())
    if (k.startsWith("contact_")) part.set(k.slice("contact_".length), v);
  return part;
}

const prefixed = (errors: FormState["fieldErrors"]) =>
  Object.fromEntries(
    Object.entries(errors ?? {}).map(([k, v]) => [`contact_${k}`, v]),
  );

export async function saveTenant(
  id: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let savedId: string | null = null;
  const result = await guardedForm(
    "manage_tenants",
    tenantSchema,
    form,
    async (member, data) => {
      // A new tenant comes with its main contact.
      const contact = id ? null : parseForm(contactSchema, contactPart(form));
      if (contact && "state" in contact) {
        return {
          fieldErrors: prefixed(contact.state.fieldErrors),
          values: Object.fromEntries(
            [...form.entries()].map(([k, v]) => [k, String(v)]),
          ),
        };
      }
      return runScoped(appDb, member, async (s) => {
        const saved = id
          ? await updateLogged(s, tenants, id, data)
          : await insertLogged(s, tenants, data);
        if (!saved) return { message: "This tenant isn't in your account." };
        const stored = parseStoredSettings("tenant", saved.settings);
        const next = withAutoSend(
          stored,
          String(form.get("remindersAutoSend") ?? ""),
        );
        if (next["reminders.autoSend"] !== stored["reminders.autoSend"])
          await saveSettings(s, { scope: "tenant", id: saved.id }, next);
        if (contact)
          await insertLogged(s, tenantContacts, {
            ...contact.data,
            tenantId: saved.id,
            isPrimary: true,
          });
        savedId = saved.id;
        return {};
      });
    },
  );
  if (savedId) {
    revalidatePath("/tenants", "layout");
    redirect(`/tenants/${savedId}`);
  }
  return result;
}

export async function addContact(
  tenantId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_tenants", contactSchema, form, (member, data) =>
    runScoped(appDb, member, async (s) => {
      await insertLogged(s, tenantContacts, {
        ...data,
        tenantId,
        isPrimary: false,
      });
      revalidatePath(`/tenants/${tenantId}`);
      return { tone: "success", message: `Added ${data.name}.` };
    }),
  );
}
