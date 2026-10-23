import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatArea } from "@/lib/format";
import { listBuildings } from "@/lib/property/queries";

export const metadata: Metadata = { title: "Buildings" };

export default function BuildingsPage() {
  return (
    <>
      <PageHeader
        title="Buildings"
        description="Your buildings, their floors and units."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Loading your buildings…
          </p>
        }
      >
        <Buildings />
      </Suspense>
    </>
  );
}

async function Buildings() {
  const member = await requireMember();
  const list = await runScoped(appDb, member, listBuildings);
  const editable = can(member.role, "manage_property");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {editable && list.length > 0 && (
        <div>
          <Button asChild className="h-11 md:h-9">
            <Link href="/leases/buildings/new">Add building</Link>
          </Button>
        </div>
      )}
      {list.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm">
            No buildings yet. Add your first building, then its units; leases
            come next.
          </p>
          {editable && (
            <Button asChild className="h-11 md:h-9">
              <Link href="/leases/buildings/new">Add building</Link>
            </Button>
          )}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((b) => (
            <li key={b.id}>
              <Link
                href={`/leases/buildings/${b.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border p-4 hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {b.city} · {b.unitCount}{" "}
                    {b.unitCount === 1 ? "unit" : "units"}
                    {b.unitCount > 0 &&
                      `, ${b.vacantCount} vacant · ${formatArea(b.totalArea)} billed`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
