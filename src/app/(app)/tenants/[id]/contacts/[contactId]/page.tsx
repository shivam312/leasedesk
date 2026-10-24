import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmActionForm } from "@/components/forms/ConfirmActionForm";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { NoAccess } from "@/components/shell/NoAccess";
import { PageHeader } from "@/components/shell/PageHeader";
import { contactFields } from "@/components/tenants/fields";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { getTenant } from "@/lib/tenants/queries";
import { removeContact, updateContact } from "@/server/actions/tenants";

export const metadata: Metadata = { title: "Edit contact" };

export default function EditContactPage({
  params,
}: PageProps<"/tenants/[id]/contacts/[contactId]">) {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <EditContact params={params} />
    </Suspense>
  );
}

async function EditContact({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  const { id, contactId } = await params;
  const uuid = /^[0-9a-f-]{36}$/;
  if (!uuid.test(id) || !uuid.test(contactId)) notFound();
  const member = await requireMember();
  if (!can(member.role, "manage_tenants"))
    return (
      <NoAccess
        message="Viewers can't change contacts. Ask an owner to change your access."
        back={{ href: `/tenants/${id}`, label: "Back to the tenant" }}
      />
    );
  const found = await runScoped(appDb, member, (s) => getTenant(s, id));
  const contact = found?.contacts.find((c) => c.id === contactId);
  if (!found || !contact) notFound();

  return (
    <>
      <Link
        href={`/tenants/${id}`}
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← {found.tenant.companyName}
      </Link>
      <PageHeader
        title={`Edit ${contact.name}`}
        description="Invoices and reminders go to Accounts contacts with an email. A tenant always keeps at least one."
      />
      <div className="flex max-w-2xl flex-col gap-10">
        <SimpleForm
          action={updateContact.bind(null, id, contactId)}
          fields={contactFields("", contact)}
          submitLabel="Save contact"
          pendingLabel="Saving…"
        />
        <section
          aria-labelledby="remove-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="remove-heading" className="font-medium">
            Remove this contact
          </h2>
          <ConfirmActionForm
            action={removeContact.bind(null, id, contactId)}
            label={`Remove ${contact.name}`}
            question={`Remove ${contact.name} from ${found.tenant.companyName}? Invoices and reminders already sent stay as they were; new ones won't go to ${contact.email ?? "them"}.`}
            confirmLabel={`Remove ${contact.name}`}
          />
        </section>
      </div>
    </>
  );
}
