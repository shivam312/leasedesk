import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatArea } from "@/lib/format";
import { UNIT_STATUS_LABELS } from "@/lib/property/forms";
import { getBuilding } from "@/lib/property/queries";
import { occupiedPercent, stackingPlan } from "@/lib/property/stacking";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Stacking plan" };

const COLOURS = {
  leased:
    "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  vacant:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  fit_out:
    "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  blocked: "border-border bg-muted text-muted-foreground",
} as const;

export default function StackingPage({
  params,
}: PageProps<"/leases/buildings/[id]/stacking">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Drawing the building…</p>
      }
    >
      <Stacking params={params} />
    </Suspense>
  );
}

async function Stacking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, (s) => getBuilding(s, id));
  if (!data) notFound();
  const { building } = data;
  const plan = stackingPlan(data.floors, data.units);
  const editable = can(member.role, "manage_property");
  const counts = Object.fromEntries(
    Object.keys(UNIT_STATUS_LABELS).map((s) => [
      s,
      data.units.filter((u) => u.status === s).length,
    ]),
  ) as Record<keyof typeof UNIT_STATUS_LABELS, number>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${building.name}: stacking plan`}
        description={
          plan.area === 0
            ? "Every floor and unit at a glance."
            : `${occupiedPercent(plan.area, plan.vacantArea)}% of ${formatArea(plan.area)} billed area is let; ${formatArea(plan.vacantArea)} is vacant.`
        }
      />

      <ul className="flex flex-wrap gap-3 text-sm" aria-label="Key">
        {(
          Object.keys(UNIT_STATUS_LABELS) as (keyof typeof UNIT_STATUS_LABELS)[]
        ).map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn("inline-block size-4 rounded border", COLOURS[s])}
              aria-hidden
            />
            {UNIT_STATUS_LABELS[s]} ({counts[s]})
          </li>
        ))}
      </ul>

      {data.units.length === 0 ? (
        <Card className="max-w-xl">
          <p className="text-sm">
            No units yet, so there&apos;s nothing to draw. Add units to see the
            building floor by floor.
          </p>
          {editable && (
            <Button asChild className="mt-3">
              <Link href={`/leases/buildings/${building.id}/units/new`}>
                Add unit
              </Link>
            </Button>
          )}
        </Card>
      ) : (
        <ol
          className="flex flex-col gap-2"
          aria-label="Floors, top floor first"
        >
          {plan.rows.map((row) => (
            <li
              key={row.floorId ?? "none"}
              className="flex flex-col gap-1 md:flex-row md:items-stretch md:gap-3"
            >
              <div className="flex items-baseline justify-between gap-2 md:w-36 md:shrink-0 md:flex-col md:justify-center">
                <span className="font-medium">{row.label}</span>
                <span className="text-xs text-muted-foreground">
                  {row.units.length === 0 ? "No units" : formatArea(row.area)}
                </span>
              </div>
              <ul className="flex min-h-14 flex-1 flex-wrap gap-1">
                {row.units.map((u) => {
                  const inner = (
                    <>
                      <span className="block truncate font-medium">
                        {u.code}
                      </span>
                      <span className="block truncate text-xs">
                        {formatArea(u.chargeableArea)}
                      </span>
                      <span className="sr-only">
                        , {UNIT_STATUS_LABELS[u.status]}
                      </span>
                    </>
                  );
                  const box = cn(
                    "block h-full min-h-14 rounded border px-2 py-1",
                    COLOURS[u.status],
                  );
                  return (
                    <li
                      key={u.id}
                      className="min-w-24"
                      // Width in proportion to billed area.
                      style={{
                        flexGrow: Math.max(
                          1,
                          Math.round(u.chargeableArea / 100),
                        ),
                        flexBasis: 0,
                      }}
                      title={`Unit ${u.code}: ${UNIT_STATUS_LABELS[u.status]}, ${formatArea(u.chargeableArea)}`}
                    >
                      {editable ? (
                        <Link
                          href={`/leases/buildings/${building.id}/units/${u.id}`}
                          className={cn(box, "hover:ring-2 hover:ring-ring")}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <span className={box}>{inner}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="text-sm text-muted-foreground">
        Tenant names appear on leased units once leases are added.
      </p>
    </div>
  );
}
