import type { Metadata } from "next";
import { NoAccess } from "@/components/shell/NoAccess";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { unitFields } from "@/components/property/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { getBuilding } from "@/lib/property/queries";
import { saveUnit } from "@/server/actions/property";

export const metadata: Metadata = { title: "Add unit" };

export default function NewUnitPage({
  params,
}: PageProps<"/leases/buildings/[id]/units/new">) {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <NewUnit params={params} />
    </Suspense>
  );
}

async function NewUnit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  if (!can(member.role, "manage_property"))
    return (
      <NoAccess
        message="Only an owner or property manager can add units."
        back={{ href: "/leases/buildings", label: "Back to Buildings" }}
      />
    );
  const data = await runScoped(appDb, member, (s) => getBuilding(s, id));
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Add unit to ${data.building.name}`} />
      <SimpleForm
        action={saveUnit.bind(null, id, null)}
        fields={unitFields(data.floors)}
        submitLabel="Add unit"
        pendingLabel="Adding…"
      />
    </>
  );
}
