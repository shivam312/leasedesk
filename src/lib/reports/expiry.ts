// The expiry schedule: running leases that end in the twelve months from a
// date, soonest first, with the last day to give notice and the rent that
// stops, then the same added up by financial-year quarter. Pure: leases in,
// a report out.

import {
  addDays,
  addMonths,
  compareDates,
  fyQuarter,
  toDayNumber,
  type PlainDate,
} from "@/lib/billing/dates";
import { sumPaise } from "@/lib/billing/money";
import { formatDate } from "@/lib/format";
import { noticeDeadline } from "@/lib/leases/critical-dates";
import type { Report, ReportRow } from "./report";
import { leaseCovers, rentFigures, type RentRollLease } from "./rent-roll";

export const EXPIRY_WINDOW_MONTHS = 12;

const QUARTER_MONTHS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

/** Leases still running (not renewed, not ended early or expired). */
const RUNNING = new Set(["active", "in_notice"]);

export function expirySchedule(
  leases: readonly RentRollLease[],
  asOf: PlainDate,
): Report {
  const until = addDays(addMonths(asOf, EXPIRY_WINDOW_MONTHS, "last_day"), -1);
  const ending = leases
    .filter(
      (l) =>
        RUNNING.has(l.status) &&
        leaseCovers(l, asOf) &&
        compareDates(l.endDate, until) <= 0,
    )
    .sort(
      (a, b) =>
        compareDates(a.endDate, b.endDate) ||
        a.tenantName.localeCompare(b.tenantName),
    );
  const rows: ReportRow[] = [];
  const quarters = new Map<
    string,
    { label: string; leases: number; area: number; rent: number[] }
  >();
  for (const l of ending) {
    const rent = rentFigures(l, l.endDate).rent;
    const notice = noticeDeadline(l, l.settings.monthEndRule);
    rows.push({
      end: l.endDate,
      days: toDayNumber(l.endDate) - toDayNumber(asOf),
      tenant: l.tenantName,
      building: l.buildingName,
      units: l.unitCodes.join(", "),
      area: l.area,
      rent,
      lockIn: l.lockInEndDate,
      notice,
      noticePassed: notice && compareDates(notice, asOf) < 0 ? "Passed" : "",
    });
    const q = fyQuarter(l.endDate);
    const key = q.start;
    const entry = quarters.get(key) ?? {
      label: `Q${q.quarter} FY ${q.fyStartYear}-${String((q.fyStartYear + 1) % 100).padStart(2, "0")} (${QUARTER_MONTHS[q.quarter - 1]})`,
      leases: 0,
      area: 0,
      rent: [],
    };
    quarters.set(key, entry);
    entry.leases++;
    entry.area += l.area;
    entry.rent.push(rent);
  }
  const quarterRows: ReportRow[] = [...quarters]
    .sort(([a], [b]) => compareDates(a, b))
    .map(([, q]) => ({
      quarter: q.label,
      leases: q.leases,
      area: q.area,
      rent: sumPaise(q.rent),
    }));
  return {
    slug: "expiry",
    title: "Expiry schedule",
    period: `Leases ending ${formatDate(asOf)} to ${formatDate(until)}`,
    sections: [
      {
        title: "Leases ending",
        empty: `No lease ends in the ${EXPIRY_WINDOW_MONTHS} months from this date.`,
        columns: [
          { key: "end", label: "Lease ends", kind: "date" },
          { key: "days", label: "Days left", kind: "count" },
          { key: "tenant", label: "Tenant", kind: "text" },
          { key: "building", label: "Building", kind: "text" },
          { key: "units", label: "Units", kind: "text" },
          { key: "area", label: "Billed area", kind: "area" },
          {
            key: "rent",
            label: "Rent per month",
            kind: "money",
            hint: "Rent in the lease's last month, before GST",
          },
          { key: "lockIn", label: "Lock-in ends", kind: "date" },
          {
            key: "notice",
            label: "Last day to give notice",
            kind: "date",
          },
          { key: "noticePassed", label: "Notice day", kind: "text" },
        ],
        rows,
        totals:
          rows.length > 0
            ? {
                tenant: "Total",
                area: sumPaise(rows.map((r) => Number(r.area))),
                rent: sumPaise(rows.map((r) => Number(r.rent))),
              }
            : undefined,
      },
      {
        title: "By quarter",
        empty: `No lease ends in the ${EXPIRY_WINDOW_MONTHS} months from this date.`,
        columns: [
          { key: "quarter", label: "Quarter", kind: "text" },
          { key: "leases", label: "Leases ending", kind: "count" },
          { key: "area", label: "Billed area", kind: "area" },
          { key: "rent", label: "Rent per month", kind: "money" },
        ],
        rows: quarterRows,
      },
    ],
    notes: [
      "Running leases only: a lease already renewed or ended early isn't listed. Quarters run April to March.",
    ],
  };
}
