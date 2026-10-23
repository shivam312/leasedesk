"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatArea } from "@/lib/format";
import { UNIT_STATUS_LABELS } from "@/lib/property/forms";
import { cn } from "@/lib/utils";

type Status = keyof typeof UNIT_STATUS_LABELS;

export interface UnitRow {
  id: string;
  code: string;
  floor: string | null;
  carpetArea: number;
  chargeableArea: number;
  status: Status;
}

const TONES: Record<Status, "neutral" | "good" | "warn" | "bad"> = {
  vacant: "warn",
  leased: "good",
  fit_out: "neutral",
  blocked: "neutral",
};

/** A building's units: search and status chips; cards on phones, a table from 768px. */
export function UnitList({
  units,
  buildingId,
  editable,
}: {
  units: UnitRow[];
  buildingId: string;
  editable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const shown = useMemo(
    () =>
      units.filter(
        (u) =>
          (status === "all" || u.status === status) &&
          `${u.code} ${u.floor ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [units, query, status],
  );
  const href = (u: UnitRow) => `/leases/buildings/${buildingId}/units/${u.id}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          type="search"
          aria-label="Search units"
          placeholder="Search by unit or floor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-xs"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {(["all", ...Object.keys(UNIT_STATUS_LABELS)] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s as Status | "all")}
              className={cn(
                "h-9 rounded-full border px-3 text-sm",
                status === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
            >
              {s === "all" ? "All" : UNIT_STATUS_LABELS[s as Status]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No units match.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {shown.map((u) => (
              <li key={u.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {editable ? (
                      <Link href={href(u)} className="underline">
                        Unit {u.code}
                      </Link>
                    ) : (
                      `Unit ${u.code}`
                    )}
                  </span>
                  <Badge tone={TONES[u.status]}>
                    {UNIT_STATUS_LABELS[u.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {u.floor ?? "No floor"} · billed{" "}
                  {formatArea(u.chargeableArea)}
                </p>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Unit</th>
                <th className="py-2 font-medium">Floor</th>
                <th className="py-2 text-right font-medium">Carpet area</th>
                <th className="py-2 text-right font-medium">Billed area</th>
                <th className="py-2 pl-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">
                    {editable ? (
                      <Link href={href(u)} className="underline">
                        {u.code}
                      </Link>
                    ) : (
                      u.code
                    )}
                  </td>
                  <td className="py-2">{u.floor ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatArea(u.carpetArea)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatArea(u.chargeableArea)}
                  </td>
                  <td className="py-2 pl-4">
                    <Badge tone={TONES[u.status]}>
                      {UNIT_STATUS_LABELS[u.status]}
                    </Badge>
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
