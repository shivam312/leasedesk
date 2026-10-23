// Every report: its name, what it is for, which filter it takes, and how it
// is loaded. The Reports screen, the Excel export and the PDF export all go
// through here, so a report added once shows and exports everywhere.

import {
  compareDates,
  monthOf,
  parseDate,
  startOfMonth,
  type PlainDate,
} from "@/lib/billing/dates";
import type { Scoped } from "@/lib/db/scoped";
import type { Report, ReportRow } from "./report";
import {
  ageingReport,
  collectionsReport,
  rentRollReport,
  vacancyReport,
} from "./queries";

/**
 * Filters a report reads from the address: ?asOf=2026-10-23, or
 * ?from=2026-10-01&to=2026-10-31 for a period.
 */
export type ReportParams = {
  asOf: PlainDate;
  from: PlainDate;
  to: PlainDate;
  today: PlainDate;
};

/** asOf: one date; range: from and to; today: no filter, figures as they are now. */
export type ReportFilter = "asOf" | "range" | "today";

export type ReportDefinition = {
  slug: string;
  title: string;
  /** One sentence on the Reports list. */
  description: string;
  filter: ReportFilter;
  load: (s: Scoped, params: ReportParams) => Promise<Report>;
};

export const REPORTS: ReportDefinition[] = [
  {
    slug: "rent-roll",
    title: "Rent roll",
    description:
      "Every running lease: units, area, rent, rate per sq ft, lease dates and the next rent increase.",
    filter: "asOf",
    load: (s, p) => rentRollReport(s, p.asOf),
  },
  {
    slug: "vacancy",
    title: "Vacancy",
    description:
      "How much of each building is leased, and every vacant unit with the day it became vacant.",
    filter: "asOf",
    load: (s, p) => vacancyReport(s, p.asOf),
  },
  {
    slug: "collections",
    title: "Collections",
    description:
      "Money received between two dates, with TDS, by payment and by tenant.",
    filter: "range",
    load: (s, p) => collectionsReport(s, p.from, p.to),
  },
  {
    slug: "ageing",
    title: "Unpaid and ageing",
    description:
      "What each tenant hasn't paid today, by how long it is overdue, and every unpaid invoice.",
    filter: "today",
    load: (s, p) => ageingReport(s, p.today),
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

/** The report's filters from the address, falling back to today and this month. */
export function reportParams(
  search: Record<string, string | string[] | undefined>,
  today: PlainDate,
): ReportParams {
  // Ten years either side is more than any lease; anything else is a typo.
  const year = Number(today.slice(0, 4));
  const sane = (value: unknown, fallback: PlainDate) => {
    const d = realDate(value);
    return d &&
      compareDates(d, `${year - 10}-01-01`) >= 0 &&
      compareDates(d, `${year + 10}-12-31`) <= 0
      ? d
      : fallback;
  };
  const from = sane(search.from, startOfMonth(monthOf(today)));
  const to = sane(search.to, today);
  return {
    today,
    asOf: sane(search.asOf, today),
    ...(compareDates(from, to) <= 0 ? { from, to } : { from: to, to: from }),
  };
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
