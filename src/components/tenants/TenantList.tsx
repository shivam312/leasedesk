"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TenantRow {
  id: string;
  companyName: string;
  gstin: string | null;
  deductsTdsRent: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

const FILTERS = {
  all: { label: "All", match: () => true },
  noGstin: { label: "No GSTIN", match: (t: TenantRow) => !t.gstin },
  noContact: {
    label: "No email",
    match: (t: TenantRow) => !t.contactEmail,
  },
} as const;
type Filter = keyof typeof FILTERS;

/** Search and filter chips; cards on phones, a table from 768px. */
export function TenantList({ tenants }: { tenants: TenantRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter(
      (t) =>
        FILTERS[filter].match(t) &&
        [t.companyName, t.gstin, t.contactName, t.contactEmail, t.contactPhone]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
  }, [tenants, query, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          type="search"
          aria-label="Search tenants"
          placeholder="Search by name, GSTIN, contact or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-11 rounded-full border px-3 text-sm md:h-9",
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
            >
              {FILTERS[f].label} ({tenants.filter(FILTERS[f].match).length})
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query.trim()
            ? `No tenants match “${query.trim()}”.`
            : "No tenants match."}{" "}
          <button
            type="button"
            className="py-3 underline"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            {query.trim() ? "Clear search" : "Show all tenants"}
          </button>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {shown.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tenants/${t.id}`}
                  className="block rounded-lg border p-3 hover:bg-accent"
                >
                  <span className="block font-medium break-words">
                    {t.companyName}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t.contactName ?? "No contact added"}
                    {t.contactPhone ? ` · ${t.contactPhone}` : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {!t.gstin && <Badge>No GSTIN</Badge>}
                    {!t.contactEmail && <Badge tone="warn">No email</Badge>}
                    <Badge>{t.deductsTdsRent ? "Deducts TDS" : "No TDS"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Tenant</th>
                <th className="py-2 font-medium">GSTIN</th>
                <th className="py-2 font-medium">Contact</th>
                <th className="py-2 font-medium">TDS on rent</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="max-w-xs py-2 font-medium">
                    <Link href={`/tenants/${t.id}`} className="underline">
                      {t.companyName}
                    </Link>
                  </td>
                  <td className="py-2 tabular-nums">
                    {t.gstin ?? "Not registered"}
                  </td>
                  <td className="py-2">
                    {t.contactName ?? "—"}
                    {t.contactEmail ? (
                      <span className="block text-muted-foreground">
                        {t.contactEmail}
                      </span>
                    ) : (
                      <Badge tone="warn">No email</Badge>
                    )}
                  </td>
                  <td className="py-2">
                    {t.deductsTdsRent ? "Deducts TDS" : "No TDS"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
