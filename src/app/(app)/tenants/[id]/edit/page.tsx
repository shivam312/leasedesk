import type { Metadata } from "next";
import { NoAccess } from "@/components/shell/NoAccess";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { tenantFields } from "@/components/tenants/fields";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { getTenant } from "@/lib/tenants/queries";
import { saveTenant } from "@/server/actions/tenants";

export const metadata: Metadata = { title: "Edit tenant" };

export default function EditTenantPage({
  params,
}: PageProps<"/tenants/[id]/edit">) {
  return (
    <>
      <PageHeader
        title="Edit tenant"
        description="Changes apply to invoices not sent yet. Sent invoices keep the details they were sent with."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <EditTenant params={params} />
      </Suspense>
    </>
  );
}

async function EditTenant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  if (!can(member.role, "manage_tenants"))
    return (
      <NoAccess
        message="Viewers can't change tenants. Ask an owner to change your access."
        back={{ href: "/tenants", label: "Back to Tenants" }}
      />
    );
  const data = await runScoped(appDb, member, (s) => getTenant(s, id));
  if (!data) notFound();
  return (
    <SimpleForm
      action={saveTenant.bind(null, id)}
      fields={tenantFields(data.tenant)}
      submitLabel="Save tenant"
      pendingLabel="Saving…"
    />
  );
}
