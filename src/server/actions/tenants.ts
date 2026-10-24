"use server";

// Tenants and their contacts.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appDb } from "@/lib/auth";
import { parseForm, type FormState } from "@/lib/auth/forms";
import { z } from "zod";
import {
  deleteLogged,
  insertLogged,
  updateLogged,
} from "@/lib/db/activity-log";
import { tenantContacts, tenants } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { parseStoredSettings } from "@/lib/settings/schema";
import { saveSettings } from "@/lib/settings/store";
import { contactsChangeProblem, nextPrimary } from "@/lib/tenants/contacts";
import { contactSchema, tenantSchema, withAutoSend } from "@/lib/tenants/forms";
import { getTenant } from "@/lib/tenants/queries";
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

/** Change a contact; refused if invoices would be left with no email. */
export async function updateContact(
  tenantId: string,
  contactId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let saved = false;
  const result = await guardedForm(
    "manage_tenants",
    contactSchema,
    form,
    (member, data) =>
      runScoped(appDb, member, async (s) => {
        const found = await getTenant(s, tenantId);
        const contact = found?.contacts.find((c) => c.id === contactId);
        if (!found || !contact)
          return { message: "That contact couldn't be found." };
        const after = found.contacts.map((c) =>
          c.id === contactId ? { ...c, ...data } : c,
        );
        const problem = contactsChangeProblem(found.contacts, after);
        if (problem) return { message: problem };
        await updateLogged(s, tenantContacts, contactId, data);
        saved = true;
        return {};
      }),
  );
  if (saved) {
    revalidatePath(`/tenants/${tenantId}`);
    redirect(`/tenants/${tenantId}`);
  }
  return result;
}

/** Remove a contact; refused if invoices would be left with no email. */
export async function removeContact(
  tenantId: string,
  contactId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let removed = false;
  const result = await guardedForm(
    "manage_tenants",
    z.object({}),
    form,
    (member) =>
      runScoped(appDb, member, async (s) => {
        const found = await getTenant(s, tenantId);
        const contact = found?.contacts.find((c) => c.id === contactId);
        if (!found || !contact)
          return { message: "That contact couldn't be found." };
        const remaining = found.contacts.filter((c) => c.id !== contactId);
        // The main contact goes: the next one becomes main, so the
        // fallback for invoices and the tenants list still have one.
        const after = contact.isPrimary
          ? remaining.map((c) =>
              c.id === nextPrimary(remaining) ? { ...c, isPrimary: true } : c,
            )
          : remaining;
        const problem = contactsChangeProblem(found.contacts, after);
        if (problem) return { message: problem };
        await deleteLogged(s, tenantContacts, contactId);
        const next = contact.isPrimary ? nextPrimary(remaining) : null;
        if (next)
          await updateLogged(s, tenantContacts, next, { isPrimary: true });
        removed = true;
        return {};
      }),
  );
  if (removed) {
    revalidatePath(`/tenants/${tenantId}`);
    redirect(`/tenants/${tenantId}`);
  }
  return result;
}
