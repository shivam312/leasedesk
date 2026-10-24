import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { LeaseList } from "@/components/leases/LeaseList";
import { PageHeader } from "@/components/shell/PageHeader";
import { LEASES_TABS, SectionTabs } from "@/components/shell/SectionTabs";
import { Button } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { listLeases } from "@/lib/leases/queries";

export const metadata: Metadata = { title: "Leases" };

export default function LeasesPage() {
  return (
    <>
      <PageHeader
        title="Leases"
        description="Every lease: who rents what, the rent, and when it ends."
      />
      <SectionTabs label="Leases views" tabs={LEASES_TABS} current="/leases" />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading leases…</p>
        }
      >
        <Leases />
      </Suspense>
      <Suspense fallback={null}>
        <ImportCard />
      </Suspense>
    </>
  );
}

/** Only for people who can add leases (the import page refuses others). */
async function ImportCard() {
  const member = await requireMember();
  if (!can(member.role, "manage_leases")) return null;
  return (
    <>
      <Link
        href="/leases/import"
        className="mt-8 flex max-w-2xl items-center justify-between gap-4 rounded-lg border p-4 hover:bg-accent"
      >
        <span>
          <span className="block font-medium">Import from Excel</span>
          <span className="block text-sm text-muted-foreground">
            Bring in buildings, units, tenants and leases from a spreadsheet.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </>
  );
}

async function Leases() {
  const member = await requireMember();
  const rows = await runScoped(appDb, member, (s) => listLeases(s));
  const editable = can(member.role, "manage_leases");
  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div>
          <Button asChild className="h-11 md:h-9">
            <Link href="/leases/new">Add lease</Link>
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="max-w-2xl text-sm">
          No leases yet.{" "}
          {editable
            ? "Add your first lease: the tenant, units, dates and rent. Add buildings and units first under Buildings, or import everything from Excel with the link below."
            : "An owner or property manager can add them."}
        </p>
      ) : (
        <LeaseList leases={rows} />
      )}
    </div>
  );
}
