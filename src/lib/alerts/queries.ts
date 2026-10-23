// Loading what the Today screen and the daily digest show, for the current
// organization. The choosing and ordering is pure (attention.ts).

import {
  and,
  count,
  eq,
  gte,
  inArray,
  lte,
  ne,
  notInArray,
  sum,
} from "drizzle-orm";
import {
  endOfMonth,
  monthOf,
  startOfMonth,
  type PlainDate,
} from "@/lib/billing/dates";
import { countLinesToMatch } from "@/lib/bank/match";
import {
  buildings,
  criticalDates,
  invoices,
  leases,
  payments,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { unpaidInvoices } from "@/lib/payments/payments";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { trackerRecords } from "@/lib/tds/certificates";
import { financialYearChoices, tdsTracker } from "@/lib/tds/tracker";
import type {
  AttentionInput,
  CriticalDateRow,
  OpenInvoiceRow,
} from "./attention";

const RUNNING = ["active", "in_notice"] as const;
const UNPAID = ["sent", "part_paid", "overdue"] as const;

/** Every sent invoice with something left on it, across all tenants. */
export async function openInvoiceRows(s: Scoped): Promise<OpenInvoiceRow[]> {
  const owing = await s.tx
    .selectDistinct({ tenantId: invoices.tenantId, name: tenants.companyName })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .where(s.where(invoices, inArray(invoices.status, [...UNPAID])));
  const rows: OpenInvoiceRow[] = [];
  for (const t of owing) {
    const settings = billingSettings(
      await loadSettings(s, { tenantId: t.tenantId }),
    );
    for (const u of await unpaidInvoices(s, t.tenantId, settings)) {
      if (u.outstandingPaise === 0) continue;
      rows.push({
        id: u.id,
        tenantId: t.tenantId,
        tenantName: t.name,
        dueDate: u.dueDate,
        outstandingPaise: u.outstandingPaise,
        expectedTdsPaise: u.expectedTdsPaise,
      });
    }
  }
  return rows;
}

/** Lease dates of running leases that aren't done and haven't passed. */
export async function upcomingDates(
  s: Scoped,
  today: PlainDate,
): Promise<CriticalDateRow[]> {
  return s.tx
    .select({
      id: criticalDates.id,
      leaseId: criticalDates.leaseId,
      tenantName: tenants.companyName,
      buildingName: buildings.name,
      type: criticalDates.type,
      date: criticalDates.date,
      remindDays: criticalDates.remindDays,
      status: criticalDates.status,
      snoozedUntil: criticalDates.snoozedUntil,
      label: criticalDates.label,
      assignedTo: criticalDates.assignedTo,
    })
    .from(criticalDates)
    .innerJoin(leases, eq(leases.id, criticalDates.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(buildings, eq(buildings.id, leases.buildingId))
    .where(
      s.where(
        criticalDates,
        ne(criticalDates.status, "done"),
        gte(criticalDates.date, today),
        inArray(leases.status, [...RUNNING]),
      ),
    );
}

/**
 * TDS certificate quarters past their due date and not in, this FY and last
 * (last year's Q4 certificate is due in June of this one), with the oldest
 * year that has one, for the link to the tracker.
 */
export async function overdueCertificates(
  s: Scoped,
  today: PlainDate,
): Promise<{ count: number; financialYear: string } | null> {
  let count = 0;
  let financialYear: string | null = null;
  for (const fy of financialYearChoices(today).slice(0, 2)) {
    const records = await trackerRecords(s, fy);
    const n = tdsTracker({ financialYear: fy, today, records }).totals
      .overdueCount;
    if (n === 0) continue;
    count += n;
    financialYear = fy;
  }
  return financialYear ? { count, financialYear } : null;
}

/** Everything the needs-attention list is built from. */
export async function attentionInput(
  s: Scoped,
  today: PlainDate,
): Promise<AttentionInput> {
  const month = monthOf(today);
  const first = startOfMonth(month);
  const drafts = await s.tx
    .select({
      month: invoices.runMonth,
      count: count(),
      total: sum(invoices.grandTotal).mapWith(Number),
    })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.status, "draft")))
    .groupBy(invoices.runMonth);
  const [made] = await s.tx
    .select({ n: count() })
    .from(invoices)
    .where(s.where(invoices, eq(invoices.runMonth, first)));
  const [running] = made?.n
    ? [{ n: 0 }]
    : await s.tx
        .select({ n: count() })
        .from(leases)
        .where(
          s.where(
            leases,
            inArray(leases.status, [...RUNNING]),
            lte(leases.startDate, endOfMonth(month)),
            gte(leases.endDate, first),
          ),
        );
  return {
    today,
    open: await openInvoiceRows(s),
    drafts: drafts.map((d) => ({
      month: d.month,
      count: d.count,
      totalPaise: d.total,
    })),
    thisMonthNotMade: !made?.n && (running?.n ?? 0) > 0 ? month : null,
    dates: await upcomingDates(s, today),
    bankLinesToMatch: await countLinesToMatch(s),
    tdsCertificatesMissing: await overdueCertificates(s, today),
  };
}

/**
 * This month's billed total (sent invoices of this month's run) and money
 * collected (payments received this month that weren't reversed), with the
 * TDS tenants kept back from those payments.
 */
export async function monthTotals(s: Scoped, today: PlainDate) {
  const month = monthOf(today);
  const [billed] = await s.tx
    .select({ total: sum(invoices.grandTotal).mapWith(Number) })
    .from(invoices)
    .where(
      s.where(
        invoices,
        eq(invoices.runMonth, startOfMonth(month)),
        notInArray(invoices.status, ["draft", "cancelled"]),
      ),
    );
  const [collected] = await s.tx
    .select({
      received: sum(payments.amountReceived).mapWith(Number),
      tds: sum(payments.tdsDeducted).mapWith(Number),
    })
    .from(payments)
    .where(
      s.where(
        payments,
        and(
          eq(payments.kind, "payment"),
          eq(payments.status, "active"),
          gte(payments.receivedDate, startOfMonth(month)),
          lte(payments.receivedDate, endOfMonth(month)),
        ),
      ),
    );
  return {
    month,
    billedPaise: billed?.total ?? 0,
    collectedPaise: collected?.received ?? 0,
    tdsKeptPaise: collected?.tds ?? 0,
  };
}

/** Whether the organization has any lease that isn't a draft. */
export async function hasLeases(s: Scoped) {
  const [row] = await s.tx
    .select({ n: count() })
    .from(leases)
    .where(s.where(leases, ne(leases.status, "draft")));
  return (row?.n ?? 0) > 0;
}
