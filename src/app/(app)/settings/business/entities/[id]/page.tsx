import type { Metadata } from "next";
import { NoAccess } from "@/components/shell/NoAccess";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { billingEntityFields } from "@/components/settings/business";
import { PageHeader } from "@/components/shell/PageHeader";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { billingEntities } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { saveBillingEntity } from "@/server/actions/business";

export const metadata: Metadata = { title: "Edit GSTIN" };

export default function EditBillingEntityPage({
  params,
}: PageProps<"/settings/business/entities/[id]">) {
  return (
    <>
      <PageHeader
        title="Edit GSTIN"
        description="Changes apply to invoices not sent yet. Sent invoices keep the details they were sent with."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <EditEntity params={params} />
      </Suspense>
    </>
  );
}

async function EditEntity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  if (!can(member.role, "manage_settings"))
    return (
      <NoAccess
        message="Only an owner can change GSTINs and bank details."
        back={{ href: "/settings/business", label: "Back to Business details" }}
      />
    );
  const [entity] = await runScoped(appDb, member, ({ tx, where }) =>
    tx
      .select()
      .from(billingEntities)
      .where(where(billingEntities, eq(billingEntities.id, id))),
  );
  if (!entity) notFound();
  return (
    <SimpleForm
      action={saveBillingEntity.bind(null, entity.id)}
      fields={billingEntityFields(entity)}
      submitLabel="Save changes"
      pendingLabel="Saving…"
    />
  );
}
