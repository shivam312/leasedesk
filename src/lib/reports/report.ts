// The shape every report takes: titled sections of typed columns and rows,
// so one screen, one Excel export and one PDF export can show any report.
// Values stay raw (paise, hundredths of a sq ft, basis points, plain dates)
// until they are shown or written, so nothing is rounded on the way.

import type { PlainDate } from "@/lib/billing/dates";
import { formatArea, formatDate, formatINR } from "@/lib/format";

/**
 * money: paise; area: hundredths of a sq ft; percent: basis points;
 * date: YYYY-MM-DD; count: a whole number; text: as it is.
 */
export type ColumnKind =
  "text" | "money" | "area" | "percent" | "date" | "count";

export type Column = {
  key: string;
  label: string;
  kind: ColumnKind;
  /** The plain words for an accounting term, shown once as a tooltip. */
  hint?: string;
};

export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;

export type ReportSection = {
  title: string;
  columns: Column[];
  rows: ReportRow[];
  /** A totals row; only the columns that add up are filled. */
  totals?: ReportRow;
  /** Said instead of an empty table. */
  empty: string;
  /** The column that heads each phone card (default: the first). */
  anchor?: string;
};

export type Report = {
  /** File names: "rent-roll", "gst-summary". */
  slug: string;
  title: string;
  /** What the figures cover, e.g. "As on 23-10-2026" or "Oct 2026". */
  period: string;
  sections: ReportSection[];
  /** Short sentences printed under the tables (how figures were worked out). */
  notes?: string[];
};

/** A cell as it reads on screen and in the PDF. */
export function cellText(kind: ColumnKind, value: Cell): string {
  if (value === null || value === "") return "";
  if (typeof value === "string") {
    // A label such as "Total" can sit in a date column.
    return kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? formatDate(value)
      : value;
  }
  switch (kind) {
    case "money":
      return formatINR(value);
    case "area":
      return formatArea(value);
    case "percent":
      return `${formatINR(value).replace("₹", "")}%`;
    case "count":
      return String(value);
    default:
      return String(value);
  }
}

/** Columns whose values line up on the right. */
export function isNumeric(kind: ColumnKind): boolean {
  return kind !== "text" && kind !== "date";
}

/** "As on 23-10-2026". */
export function asOnLabel(date: PlainDate): string {
  return `As on ${formatDate(date)}`;
}
