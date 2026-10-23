import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ImportForm } from "@/components/imports/ImportForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import {
  importProperty,
  importTenantsAndLeases,
} from "@/server/actions/imports";

export const metadata: Metadata = { title: "Import from Excel" };

export default function ImportPage() {
  return (
    <>
      <Link
        href="/leases"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Leases
      </Link>
      <PageHeader
        title="Import from Excel"
        description="Bring in your buildings, units, tenants and leases from a spreadsheet: download the template, copy your rows into it, and import it. Nothing is saved until every row is right."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Imports />
      </Suspense>
    </>
  );
}

async function Imports() {
  const member = await requireMember();
  const property = can(member.role, "manage_property");
  const leases = can(member.role, "manage_leases");
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section
        aria-labelledby="property-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="property-heading" className="text-lg font-semibold">
          1. Buildings and units
        </h2>
        <p className="text-sm text-muted-foreground">
          One sheet of buildings and one of units, with floors and areas.
        </p>
        <a
          href="/leases/import/template/buildings-and-units"
          download
          className={buttonVariants({
            variant: "outline",
            className: "h-11 self-start md:h-9",
          })}
        >
          Download the template
        </a>
        {property ? (
          <ImportForm
            action={importProperty}
            submitLabel="Import buildings and units"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            An owner or property manager can import buildings and units.
          </p>
        )}
      </section>
      <section aria-labelledby="leases-heading" className="flex flex-col gap-3">
        <h2 id="leases-heading" className="text-lg font-semibold">
          2. Tenants and leases
        </h2>
        <p className="text-sm text-muted-foreground">
          One sheet of tenants with their main contact and TDS, and one of
          leases: units, dates, rent, a yearly rent increase, maintenance and
          parking. Import buildings and units first.
        </p>
        <a
          href="/leases/import/template/tenants-and-leases"
          download
          className={buttonVariants({
            variant: "outline",
            className: "h-11 self-start md:h-9",
          })}
        >
          Download the template
        </a>
        {leases ? (
          <ImportForm
            action={importTenantsAndLeases}
            submitLabel="Import tenants and leases"
            primary={false}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            An owner or property manager can import tenants and leases.
          </p>
        )}
      </section>
    </div>
  );
}
