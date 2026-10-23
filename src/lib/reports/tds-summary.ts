// The TDS summary for a financial year: by tenant and quarter, the TDS
// tenants kept back per our records, how much of it their certificates cover,
// and when each certificate is due. Built on the TDS tracker, so the screen
// under Billing and this report never disagree. Pure: records in, a report out.

import type { PlainDate } from "@/lib/billing/dates";
import { sumPaise } from "@/lib/billing/money";
import { TAX_LABELS } from "@/lib/config/tax-labels";
import { tdsTracker, type TrackerRecord } from "@/lib/tds/tracker";
import type { Report, ReportRow } from "./report";

const QUARTERS = [
  "Q1 (Apr–Jun)",
  "Q2 (Jul–Sep)",
  "Q3 (Oct–Dec)",
  "Q4 (Jan–Mar)",
];

export function tdsSummary(
  records: readonly TrackerRecord[],
  pans: ReadonlyMap<string, string | null>,
  financialYear: string,
  today: PlainDate,
): Report {
  const { rows } = tdsTracker({ financialYear, today, records });
  const quarterRows: ReportRow[] = [];
  for (const r of rows) {
    for (const c of r.quarters) {
      if (c.status === "none") continue;
      quarterRows.push({
        tenant: r.tenantName,
        pan: pans.get(r.tenantId) ?? "",
        quarter: QUARTERS[c.quarter - 1]!,
        tds: c.amount,
        received: c.received,
        pending: c.amount - c.received,
        due: c.due,
        status:
          c.status === "received"
            ? "Received"
            : c.overdue
              ? "Overdue"
              : c.status === "part"
                ? "Part received"
                : "Not received",
      });
    }
  }
  const total = (key: string) =>
    sumPaise(quarterRows.map((r) => Number(r[key] ?? 0)));
  const cert = TAX_LABELS.tdsCertificate;
  return {
    slug: "tds-summary",
    title: "TDS summary",
    period: `FY ${financialYear}`,
    sections: [
      {
        title: "By tenant and quarter",
        empty: `No TDS recorded for FY ${financialYear}.`,
        columns: [
          { key: "tenant", label: "Tenant", kind: "text" },
          { key: "pan", label: "Tenant PAN", kind: "text" },
          { key: "quarter", label: "Quarter", kind: "text" },
          { key: "tds", label: "TDS deducted", kind: "money" },
          {
            key: "received",
            label: `Covered by ${cert}`,
            kind: "money",
          },
          { key: "pending", label: `${cert} pending`, kind: "money" },
          { key: "due", label: `${cert} due`, kind: "date" },
          { key: "status", label: "Status", kind: "text" },
        ],
        rows: quarterRows,
        totals:
          quarterRows.length > 0
            ? {
                tenant: "Total",
                tds: total("tds"),
                received: total("received"),
                pending: total("pending"),
              }
            : undefined,
      },
    ],
    notes: [
      "TDS is as recorded with payments (reversed payments left out), in the quarter set by the TDS quarter setting.",
      `Compare with ${TAX_LABELS.taxCreditStatement} or the tenant's ${cert} before filing your return.`,
    ],
  };
}
