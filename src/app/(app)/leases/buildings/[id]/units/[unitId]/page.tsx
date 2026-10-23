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

export const metadata: Metadata = { title: "Edit unit" };

export default function EditUnitPage({
  params,
}: PageProps<"/leases/buildings/[id]/units/[unitId]">) {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <EditUnit params={params} />
    </Suspense>
  );
}

async function EditUnit({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(unitId))
    notFound();
  const member = await requireMember();
  if (!can(member.role, "manage_property"))
    return (
      <NoAccess
        message="Only an owner or property manager can change units."
        back={{ href: "/leases/buildings", label: "Back to Buildings" }}
      />
    );
  const data = await runScoped(appDb, member, (s) => getBuilding(s, id));
  const unit = data?.units.find((u) => u.id === unitId);
  if (!data || !unit) notFound();
  return (
    <>
      <PageHeader
        title={`Unit ${unit.code}`}
        description={`${data.building.name}. Area changes don't affect leases already signed: each lease keeps the area it was signed for.`}
      />
      <SimpleForm
        action={saveUnit.bind(null, id, unitId)}
        fields={unitFields(data.floors, unit)}
        submitLabel="Save unit"
        pendingLabel="Saving…"
      />
    </>
  );
}
