import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { UnitList } from "@/components/property/UnitList";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { GST_STATES } from "@/lib/india/identifiers";
import { getBuilding } from "@/lib/property/queries";
import { addFloor } from "@/server/actions/property";

export const metadata: Metadata = { title: "Building" };

export default function BuildingPage({
  params,
}: PageProps<"/leases/buildings/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the building…</p>
      }
    >
      <Building params={params} />
    </Suspense>
  );
}

async function Building({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, (s) => getBuilding(s, id));
  if (!data) notFound();
  const { building, floors, units } = data;
  const editable = can(member.role, "manage_property");
  const floorLabel = new Map(floors.map((f) => [f.id, f.label]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          title={building.name}
          description={`${building.address}, ${building.city}, ${GST_STATES[building.stateCode] ?? building.stateCode}`}
        />
        <div className="-mt-3 flex flex-wrap gap-2">
          {editable && (
            <Button asChild>
              <Link href={`/leases/buildings/${building.id}/units/new`}>
                Add unit
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/leases/buildings/${building.id}/stacking`}>
              Stacking plan
            </Link>
          </Button>
          {editable && (
            <Button asChild variant="ghost">
              <Link href={`/leases/buildings/${building.id}/edit`}>
                Edit building
              </Link>
            </Button>
          )}
        </div>
      </div>

      <section aria-labelledby="units-heading">
        <h2 id="units-heading" className="mb-3 text-lg font-semibold">
          Units ({units.length})
        </h2>
        {units.length === 0 ? (
          <Card className="max-w-xl">
            <p className="text-sm">
              No units yet. Add each office, shop or floor you rent out
              {floors.length === 0
                ? "; add floors first if the building has them"
                : ""}
              .
            </p>
          </Card>
        ) : (
          <UnitList
            buildingId={building.id}
            editable={editable}
            units={units.map((u) => ({
              id: u.id,
              code: u.code,
              floor: u.floorId ? (floorLabel.get(u.floorId) ?? null) : null,
              carpetArea: u.carpetArea,
              chargeableArea: u.chargeableArea,
              status: u.status,
            }))}
          />
        )}
      </section>

      <section aria-labelledby="floors-heading" className="max-w-xl">
        <h2 id="floors-heading" className="mb-1 text-lg font-semibold">
          Floors
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {floors.length === 0
            ? "No floors. Small buildings can skip them."
            : floors.map((f) => f.label).join(", ")}
        </p>
        {editable && (
          <SimpleForm
            action={addFloor.bind(null, building.id)}
            fields={[
              {
                name: "label",
                label: "New floor",
                required: true,
                hint: "Like Ground, 1st or Basement. Added at the top.",
              },
            ]}
            submitLabel="Add floor"
            pendingLabel="Adding…"
            secondary
          />
        )}
      </section>
    </div>
  );
}
