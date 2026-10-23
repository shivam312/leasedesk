// The stacking plan: a building drawn floor by floor, top floor first, each
// floor's units side by side in proportion to their billed area.

export interface StackUnit {
  id: string;
  code: string;
  floorId: string | null;
  chargeableArea: number;
  status: "vacant" | "leased" | "fit_out" | "blocked";
}

export interface StackRow {
  floorId: string | null;
  label: string;
  units: StackUnit[];
  /** Billed area of the floor, hundredths of a sq ft. */
  area: number;
  vacantArea: number;
}

export function stackingPlan(
  floors: { id: string; label: string; sortOrder: number }[],
  units: StackUnit[],
): { rows: StackRow[]; area: number; vacantArea: number } {
  const row = (floorId: string | null, label: string): StackRow => {
    const own = units
      .filter((u) => u.floorId === floorId)
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    const sum = (list: StackUnit[]) =>
      list.reduce((total, u) => total + u.chargeableArea, 0);
    return {
      floorId,
      label,
      units: own,
      area: sum(own),
      vacantArea: sum(own.filter((u) => u.status === "vacant")),
    };
  };
  const rows = [...floors]
    .sort((a, b) => b.sortOrder - a.sortOrder)
    .map((f) => row(f.id, f.label));
  const loose = row(null, "No floor");
  if (loose.units.length > 0) rows.push(loose);
  return {
    rows,
    area: rows.reduce((t, r) => t + r.area, 0),
    vacantArea: rows.reduce((t, r) => t + r.vacantArea, 0),
  };
}

/** Occupancy as a whole percent of billed area, rounded down: 1 sq ft short of full isn't 100%. */
export function occupiedPercent(area: number, vacantArea: number): number {
  if (area === 0) return 0;
  return Math.floor(((area - vacantArea) * 100) / area);
}
