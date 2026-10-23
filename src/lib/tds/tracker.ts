// The TDS tracker (india-compliance skill, "TDS"): TDS per our records by
// tenant and financial-year quarter, whether the tenant's certificate is in,
// and which are past their due date. Pure: records and today in, rows out.

import {
  compareDates,
  financialYear,
  toPlainDate,
  type PlainDate,
} from "@/lib/billing/dates";
import type { Paise } from "@/lib/billing/money";
import { TDS_CERTIFICATE_DUE } from "@/lib/config/tax-labels";

export type Quarter = 1 | 2 | 3 | 4;

export type TrackerRecord = {
  tenantId: string;
  tenantName: string;
  financialYear: string;
  quarter: number;
  amount: Paise;
  certificateReceived: boolean;
  documentId: string | null;
};

export type QuarterCell = {
  quarter: Quarter;
  amount: Paise;
  received: Paise;
  /** none: no TDS that quarter; part: certificate covers some of it. */
  status: "none" | "pending" | "part" | "received";
  due: PlainDate;
  overdue: boolean;
  documentIds: string[];
};

/** "2026-27", quarter 3 → when its certificate is due (15 Feb 2027). [CA] */
export function certificateDue(fy: string, quarter: Quarter): PlainDate {
  const start = Number(fy.slice(0, 4));
  const { month, day } = TDS_CERTIFICATE_DUE[quarter];
  // Q1 and Q2 are due in the FY's first calendar year; Q3 (February) and
  // Q4 (June, after the year ends) in the next.
  return toPlainDate(quarter <= 2 ? start : start + 1, month, day);
}

/** This financial year and the two before it, newest first. */
export function financialYearChoices(today: PlainDate): string[] {
  const start = financialYear(today).startYear;
  return [0, 1, 2].map(
    (n) => `${start - n}-${String((start - n + 1) % 100).padStart(2, "0")}`,
  );
}

export function tdsTracker({
  financialYear: fy,
  today,
  records,
}: {
  financialYear: string;
  today: PlainDate;
  records: readonly TrackerRecord[];
}) {
  const byTenant = new Map<string, { name: string; cells: QuarterCell[] }>();
  for (const r of records) {
    if (r.financialYear !== fy) continue;
    let t = byTenant.get(r.tenantId);
    if (!t) {
      t = {
        name: r.tenantName,
        cells: ([1, 2, 3, 4] as Quarter[]).map((quarter) => ({
          quarter,
          amount: 0,
          received: 0,
          status: "none",
          due: certificateDue(fy, quarter),
          overdue: false,
          documentIds: [],
        })),
      };
      byTenant.set(r.tenantId, t);
    }
    const cell = t.cells[r.quarter - 1]!;
    cell.amount += r.amount;
    if (r.certificateReceived) cell.received += r.amount;
    if (r.documentId && !cell.documentIds.includes(r.documentId))
      cell.documentIds.push(r.documentId);
  }
  let total = 0;
  let missing = 0;
  let overdueCount = 0;
  const rows = [...byTenant.entries()]
    .map(([tenantId, t]) => {
      for (const c of t.cells) {
        c.status =
          c.amount === 0
            ? "none"
            : c.received >= c.amount
              ? "received"
              : c.received > 0
                ? "part"
                : "pending";
        c.overdue =
          (c.status === "pending" || c.status === "part") &&
          compareDates(today, c.due) > 0;
        if (c.overdue) overdueCount++;
      }
      const rowTotal = t.cells.reduce((s, c) => s + c.amount, 0);
      const rowMissing = t.cells.reduce((s, c) => s + c.amount - c.received, 0);
      total += rowTotal;
      missing += rowMissing;
      return {
        tenantId,
        tenantName: t.name,
        total: rowTotal,
        missing: rowMissing,
        quarters: t.cells,
      };
    })
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName));
  return { rows, totals: { total, missing, overdueCount } };
}
