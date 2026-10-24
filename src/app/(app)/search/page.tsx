import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";
import { globalSearch } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageHeader
        title="Search"
        description="Find a tenant, a unit or an invoice number."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Searching…</p>}
      >
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const linkRow =
  "flex flex-col gap-0.5 px-4 py-3 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

async function Results({
  searchParams,
}: {
  searchParams: PageProps<"/search">["searchParams"];
}) {
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  const member = await requireMember();
  const found = await runScoped(appDb, member, (s) => globalSearch(s, q));
  const count =
    found.tenants.length + found.units.length + found.invoices.length;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form method="get" className="flex gap-2" role="search">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search"
          placeholder="Tenant, unit or invoice number"
          autoFocus={!q}
        />
        <Button type="submit" variant="outline" className="h-11 md:h-10">
          Search
        </Button>
      </form>
      {q && count === 0 && (
        <Card>
          <p className="text-sm">
            Nothing matches “{q}”. Try part of a name, a unit like 301, or an
            invoice number like SCT/26-27/0012.
          </p>
        </Card>
      )}
      {found.tenants.length > 0 && (
        <section aria-labelledby="found-tenants">
          <h2 id="found-tenants" className="mb-2 font-semibold">
            Tenants
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {found.tenants.map((t) => (
              <li key={t.id}>
                <Link href={`/tenants/${t.id}`} className={linkRow}>
                  <span className="font-medium break-words">{t.name}</span>
                  {t.gstin && (
                    <span className="text-sm text-muted-foreground">
                      {t.gstin}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {found.units.length > 0 && (
        <section aria-labelledby="found-units">
          <h2 id="found-units" className="mb-2 font-semibold">
            Units
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {found.units.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/leases/buildings/${u.buildingId}`}
                  className={linkRow}
                >
                  <span className="font-medium">Unit {u.code}</span>
                  <span className="text-sm text-muted-foreground">
                    {u.building}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {found.invoices.length > 0 && (
        <section aria-labelledby="found-invoices">
          <h2 id="found-invoices" className="mb-2 font-semibold">
            Invoices
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {found.invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/billing/invoices/${i.id}`} className={linkRow}>
                  <span className="font-medium tabular-nums">{i.number}</span>
                  <span className="text-sm text-muted-foreground">
                    {i.tenant} · {formatDate(i.invoiceDate)} ·{" "}
                    {formatINR(i.grandTotal)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
