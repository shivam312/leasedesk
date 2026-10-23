// Every report: its name, what it is for, which filter it takes, and how it
// is loaded. The Reports screen, the Excel export and the PDF export all go
// through here, so a report added once shows and exports everywhere.

import { compareDates, parseDate, type PlainDate } from "@/lib/billing/dates";
import type { Scoped } from "@/lib/db/scoped";
import type { Report, ReportRow } from "./report";
import { rentRollReport, vacancyReport } from "./queries";

/** Filters a report reads from the address: ?asOf=2026-10-23 */
export type ReportParams = { asOf: PlainDate };

export type ReportDefinition = {
  slug: string;
  title: string;
  /** One sentence on the Reports list. */
  description: string;
  /** The words on the date filter. */
  dateLabel: string;
  load: (s: Scoped, params: ReportParams) => Promise<Report>;
};

export const REPORTS: ReportDefinition[] = [
  {
    slug: "rent-roll",
    title: "Rent roll",
    description:
      "Every running lease: units, area, rent, rate per sq ft, lease dates and the next rent increase.",
    dateLabel: "As on",
    load: (s, p) => rentRollReport(s, p.asOf),
  },
  {
    slug: "vacancy",
    title: "Vacancy",
    description:
      "How much of each building is leased, and every vacant unit with the day it became vacant.",
    dateLabel: "As on",
    load: (s, p) => vacancyReport(s, p.asOf),
  },
];

export function findReport(slug: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.slug === slug);
}

function realDate(value: unknown): PlainDate | null {
  if (typeof value !== "string") return null;
  try {
    parseDate(value);
    return value;
  } catch {
    return null;
  }
}

/** The report's filters from the address, falling back to today. */
export function reportParams(
  search: Record<string, string | string[] | undefined>,
  today: PlainDate,
): ReportParams {
  const asOf = realDate(search.asOf) ?? today;
  // Ten years either side is more than any lease; anything else is a typo.
  const tooFar =
    compareDates(asOf, `${Number(today.slice(0, 4)) - 10}-01-01`) < 0 ||
    compareDates(asOf, `${Number(today.slice(0, 4)) + 10}-12-31`) > 0;
  return { asOf: tooFar ? today : asOf };
}

/** Rows whose words contain `query` (any case); the totals row is dropped when filtered. */
export function searchReport(report: Report, query: string): Report {
  const q = query.trim().toLowerCase();
  if (!q) return report;
  const matches = (row: ReportRow) =>
    Object.values(row).some(
      (v) => typeof v === "string" && v.toLowerCase().includes(q),
    );
  return {
    ...report,
    sections: report.sections.map((sec) => ({
      ...sec,
      rows: sec.rows.filter(matches),
      totals: undefined,
      empty: `Nothing matches "${query.trim()}".`,
    })),
  };
}
