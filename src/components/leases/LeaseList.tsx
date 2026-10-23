"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LEASE_STATUS, type LeaseStatus } from "./status";

export interface LeaseRow {
  id: string;
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  version: number;
  tenantName: string;
  buildingName: string;
}

type Filter = "current" | "all";

/** Leases: search and a current/all chip; cards on phones, a table from 768px. */
export function LeaseList({ leases }: { leases: LeaseRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("current");
  const shown = useMemo(
    () =>
      leases.filter(
        (l) =>
          (filter === "all" ||
            l.status === "active" ||
            l.status === "in_notice" ||
            l.status === "draft") &&
          `${l.tenantName} ${l.buildingName}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [leases, query, filter],
  );
  const chip = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm md:min-h-9",
        filter === value && "bg-primary text-primary-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          type="search"
          aria-label="Search leases"
          placeholder="Search by tenant or building"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-sm"
        />
        <div className="flex gap-2">
          {chip("current", "Current")}
          {chip("all", "All, with ended")}
        </div>
      </div>
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No leases match. Clear the search or show all leases.
        </p>
      )}
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 font-normal">Tenant</th>
            <th className="py-2 font-normal">Building</th>
            <th className="py-2 font-normal">Dates</th>
            <th className="py-2 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => (
            <tr key={l.id} className="border-t hover:bg-accent">
              <td className="max-w-xs truncate py-2">
                <Link
                  href={`/leases/${l.id}`}
                  className="font-medium hover:underline"
                >
                  {l.tenantName}
                </Link>
              </td>
              <td className="py-2">{l.buildingName}</td>
              <td className="py-2 tabular-nums">
                {formatDate(l.startDate)} to {formatDate(l.endDate)}
              </td>
              <td className="py-2">
                <Badge tone={LEASE_STATUS[l.status].tone}>
                  {LEASE_STATUS[l.status].label}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-2 md:hidden">
        {shown.map((l) => (
          <li key={l.id}>
            <Link
              href={`/leases/${l.id}`}
              className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-accent"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium break-words">{l.tenantName}</span>
                <Badge tone={LEASE_STATUS[l.status].tone}>
                  {LEASE_STATUS[l.status].label}
                </Badge>
              </span>
              <span className="text-sm text-muted-foreground">
                {l.buildingName} · {formatDate(l.startDate)} to{" "}
                {formatDate(l.endDate)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
