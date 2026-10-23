// Vacancy: by building, how much billed area is leased on a date, and every
// unit no lease covers, with the day it became vacant. A unit counts as
// leased only when a saved lease covers the date, whatever its marked status
// says. Pure: units and lease dates in, a report out.

import { addDays, compareDates, type PlainDate } from "@/lib/billing/dates";
import { occupiedPercent } from "@/lib/property/stacking";
import { UNIT_STATUS_LABELS } from "@/lib/property/forms";
import { asOnLabel, type Report, type ReportRow } from "./report";
import { leaseCovers } from "./rent-roll";

export type VacancyUnit = {
  id: string;
  buildingName: string;
  floorLabel: string | null;
  code: string;
  /** Billed (chargeable) area, hundredths of a sq ft. */
  area: number;
  status: keyof typeof UNIT_STATUS_LABELS;
};

export type UnitLease = {
  unitId: string;
  status: string;
  startDate: PlainDate;
  endDate: PlainDate;
};

export function vacancy(
  units: readonly VacancyUnit[],
  leases: readonly UnitLease[],
  asOf: PlainDate,
): Report {
  const leased = new Set(
    leases.filter((l) => leaseCovers(l, asOf)).map((l) => l.unitId),
  );
  const buildings = new Map<
    string,
    { units: number; vacant: number; area: number; vacantArea: number }
  >();
  const vacantRows: ReportRow[] = [];
  const sorted = [...units].sort(
    (a, b) =>
      a.buildingName.localeCompare(b.buildingName) ||
      a.code.localeCompare(b.code, "en", { numeric: true }),
  );
  for (const u of sorted) {
    const b = buildings.get(u.buildingName) ?? {
      units: 0,
      vacant: 0,
      area: 0,
      vacantArea: 0,
    };
    buildings.set(u.buildingName, b);
    b.units++;
    b.area += u.area;
    if (leased.has(u.id)) continue;
    b.vacant++;
    b.vacantArea += u.area;
    // Vacant since the day after its last lease ended before the date.
    let lastEnd: PlainDate | null = null;
    for (const l of leases) {
      if (l.unitId !== u.id || l.status === "draft") continue;
      if (compareDates(l.endDate, asOf) >= 0) continue;
      if (lastEnd === null || compareDates(l.endDate, lastEnd) > 0)
        lastEnd = l.endDate;
    }
    const upcoming = leases
      .filter(
        (l) =>
          l.unitId === u.id &&
          l.status !== "draft" &&
          compareDates(l.startDate, asOf) > 0,
      )
      .map((l) => l.startDate)
      .sort()[0];
    vacantRows.push({
      building: u.buildingName,
      floor: u.floorLabel,
      unit: u.code,
      area: u.area,
      since: lastEnd ? addDays(lastEnd, 1) : null,
      history: lastEnd ? "" : "Never leased",
      nextLease: upcoming ?? null,
      marked:
        u.status === "fit_out" || u.status === "blocked"
          ? UNIT_STATUS_LABELS[u.status]
          : "",
    });
  }
  const summary: ReportRow[] = [...buildings].map(([name, b]) => ({
    building: name,
    units: b.units,
    vacantUnits: b.vacant,
    area: b.area,
    vacantArea: b.vacantArea,
    leasedPercent: occupiedPercent(b.area, b.vacantArea) * 100,
  }));
  const all = [...buildings.values()];
  const area = all.reduce((t, b) => t + b.area, 0);
  const vacantArea = all.reduce((t, b) => t + b.vacantArea, 0);
  return {
    slug: "vacancy",
    title: "Vacancy",
    period: asOnLabel(asOf),
    sections: [
      {
        title: "By building",
        empty: "No units yet. Add buildings and units in Leases → Buildings.",
        columns: [
          { key: "building", label: "Building", kind: "text" },
          { key: "units", label: "Units", kind: "count" },
          { key: "vacantUnits", label: "Vacant units", kind: "count" },
          { key: "area", label: "Billed area", kind: "area" },
          { key: "vacantArea", label: "Vacant area", kind: "area" },
          {
            key: "leasedPercent",
            label: "Leased",
            kind: "percent",
            hint: "Share of billed area under a running lease",
          },
        ],
        rows: summary,
        totals:
          summary.length > 1
            ? {
                building: "Total",
                units: all.reduce((t, b) => t + b.units, 0),
                vacantUnits: all.reduce((t, b) => t + b.vacant, 0),
                area,
                vacantArea,
                leasedPercent: occupiedPercent(area, vacantArea) * 100,
              }
            : undefined,
      },
      {
        title: "Vacant units",
        empty: "Every unit is leased on this date.",
        columns: [
          { key: "building", label: "Building", kind: "text" },
          { key: "floor", label: "Floor", kind: "text" },
          { key: "unit", label: "Unit", kind: "text" },
          { key: "area", label: "Billed area", kind: "area" },
          { key: "since", label: "Vacant since", kind: "date" },
          { key: "history", label: "Note", kind: "text" },
          { key: "nextLease", label: "Next lease starts", kind: "date" },
          { key: "marked", label: "Unit status", kind: "text" },
        ],
        rows: vacantRows,
      },
    ],
    notes: [
      "A unit is leased when a saved lease covers the date. Leased % is of billed area, rounded down.",
    ],
  };
}
