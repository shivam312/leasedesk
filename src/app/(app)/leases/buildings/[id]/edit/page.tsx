import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { buildingFields } from "@/components/property/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { billingEntityOptions, getBuilding } from "@/lib/property/queries";
import { saveBuilding } from "@/server/actions/property";

export const metadata: Metadata = { title: "Edit building" };

export default function EditBuildingPage({
  params,
}: PageProps<"/leases/buildings/[id]/edit">) {
  return (
    <>
      <PageHeader title="Edit building" />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <EditBuilding params={params} />
      </Suspense>
    </>
  );
}

async function EditBuilding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => ({
    building: await getBuilding(s, id),
    entities: await billingEntityOptions(s),
  }));
  if (!data.building) notFound();
  return (
    <SimpleForm
      action={saveBuilding.bind(null, id)}
      fields={buildingFields(data.entities, data.building.building)}
      submitLabel="Save building"
      pendingLabel="Saving…"
    />
  );
}
