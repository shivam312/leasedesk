// Every report: its name, what it is for, which filter it takes, and how it
// is loaded. The Reports screen, the Excel export and the PDF export all go
// through here, so a report added once shows and exports everywhere.

import {
  compareDates,
  monthOf,
  parseDate,
  startOfMonth,
  type PlainDate,
  type YearMonth,
} from "@/lib/billing/dates";
import type { Scoped } from "@/lib/db/scoped";
import type { Report, ReportRow } from "./report";
import { financialYearChoices } from "@/lib/tds/tracker";
import {
  ageingReport,
  collectionsReport,
  gstSummaryReport,
  tdsSummaryReport,
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
  /** "2026-10" */
  month: YearMonth;
  /** "2026-27" */
  financialYear: string;
  today: PlainDate;
};

/**
 * asOf: one date; range: from and to; month: one month; fy: a financial
 * year; today: no filter, figures as they are now.
 */
export type ReportFilter = "asOf" | "range" | "month" | "fy" | "today";

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
  {
    slug: "gst-summary",
    title: "GST summary",
    description:
      "A month's invoices and credit notes by GST rate, with CGST, SGST and IGST, for your GST returns.",
    filter: "month",
    load: (s, p) => gstSummaryReport(s, p.month),
  },
  {
    slug: "tds-summary",
    title: "TDS summary",
    description:
      "TDS tenants kept back in a financial year, by quarter, and how much their certificates cover.",
    filter: "fy",
    load: (s, p) => tdsSummaryReport(s, p.financialYear, p.today),
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
  const monthParam = typeof search.month === "string" ? search.month : "";
  const month = /^\d{4}-\d{2}$/.test(monthParam)
    ? monthOf(sane(`${monthParam}-01`, startOfMonth(monthOf(today))))
    : monthOf(today);
  const years = financialYearChoices(today);
  const financialYear =
    typeof search.fy === "string" && years.includes(search.fy)
      ? search.fy
      : years[0]!;
  return {
    today,
    month,
    financialYear,
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
