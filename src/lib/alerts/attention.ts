// The Today screen's "Needs attention" list and its three numbers
// (docs/PRODUCT_PLAN.md, Home). Pure: the page loads plain rows and today's
// date, and this decides what shows, in what order, and the totals.

import {
  addDays,
  compareDates,
  toDayNumber,
  type PlainDate,
  type YearMonth,
} from "@/lib/billing/dates";
import type { Paise } from "@/lib/billing/money";
import { amountToAsk } from "@/lib/reminders/schedule";

/** A sent invoice with something left on it (from unpaidInvoices). */
export type OpenInvoiceRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  dueDate: PlainDate;
  outstandingPaise: Paise;
  expectedTdsPaise: Paise;
};

export type CriticalDateType =
  | "expiry"
  | "lock_in_end"
  | "escalation"
  | "renewal_option"
  | "notice_deadline"
  | "custom";

/** A critical date of a running lease. */
export type CriticalDateRow = {
  id: string;
  leaseId: string;
  tenantName: string;
  buildingName: string;
  type: CriticalDateType;
  date: PlainDate;
  remindDays: readonly number[];
  status: "open" | "done" | "snoozed";
  snoozedUntil: PlainDate | null;
  label: string | null;
  assignedTo: string | null;
};

export type AttentionInput = {
  today: PlainDate;
  open: readonly OpenInvoiceRow[];
  /** Not-sent-yet invoices by month (YYYY-MM-01), any month. */
  drafts: readonly { month: PlainDate; count: number; totalPaise: Paise }[];
  /** This month has no invoices at all, though leases are running. */
  thisMonthNotMade: YearMonth | null;
  dates: readonly CriticalDateRow[];
  bankLinesToMatch: number;
  /** Quarters whose TDS certificate is past its due date and not in, and
   * the oldest financial year they are in. */
  tdsCertificatesMissing: { count: number; financialYear: string } | null;
};

export type OverdueItem = {
  kind: "overdue";
  key: string;
  sortDate: PlainDate;
  tenantId: string;
  tenantName: string;
  /** What the tenant is asked to pay: unpaid less TDS they may still keep back. */
  amountPaise: Paise;
  invoiceCount: number;
  oldestInvoiceId: string;
  oldestDueDate: PlainDate;
  daysOverdue: number;
};

export type AttentionItem =
  | OverdueItem
  | { kind: "not_made"; key: string; sortDate: PlainDate; month: YearMonth }
  | {
      kind: "not_sent";
      key: string;
      sortDate: PlainDate;
      month: PlainDate;
      count: number;
      totalPaise: Paise;
    }
  | { kind: "bank_lines"; key: string; sortDate: PlainDate; count: number }
  | {
      kind: "tds_missing";
      key: string;
      sortDate: PlainDate;
      count: number;
      financialYear: string;
    }
  | {
      kind: "date";
      key: string;
      sortDate: PlainDate;
      date: CriticalDateRow;
      daysAway: number;
    };

// Same day: money already late first, then the month's invoices, then
// bank lines and certificates, then lease dates.
const RANK: Record<AttentionItem["kind"], number> = {
  overdue: 0,
  not_made: 1,
  not_sent: 2,
  bank_lines: 3,
  tds_missing: 4,
  date: 5,
};

export function daysFrom(from: PlainDate, to: PlainDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Whether a lease date is on the list today: not done, not snoozed past
 * today, not passed, and within its longest reminder (e.g. an expiry with
 * reminders at 180, 90 and 30 days shows from 180 days before). A date with
 * no reminder days never shows.
 */
export function dateShows(d: CriticalDateRow, today: PlainDate): boolean {
  if (d.status === "done") return false;
  if (
    d.status === "snoozed" &&
    d.snoozedUntil &&
    compareDates(d.snoozedUntil, today) > 0
  )
    return false;
  if (compareDates(d.date, today) < 0) return false;
  if (d.remindDays.length === 0) return false;
  const lead = Math.max(...d.remindDays);
  return compareDates(d.date, addDays(today, lead)) <= 0;
}

/**
 * Tenants who haven't paid, one item per tenant: their sent invoices past
 * the due date with something still to ask for, oldest first. An invoice
 * where only the TDS the tenant may keep back is left isn't chased here
 * (its certificate is, like the reminders; docs/BILLING_RULES.md section 14).
 */
export function overdueByTenant(
  open: readonly OpenInvoiceRow[],
  today: PlainDate,
): OverdueItem[] {
  const byTenant = new Map<string, OverdueItem>();
  for (const inv of open) {
    if (compareDates(inv.dueDate, today) >= 0) continue;
    const ask = amountToAsk(inv);
    if (ask === 0) continue;
    const item = byTenant.get(inv.tenantId);
    if (!item) {
      byTenant.set(inv.tenantId, {
        kind: "overdue",
        key: `overdue:${inv.tenantId}`,
        sortDate: inv.dueDate,
        tenantId: inv.tenantId,
        tenantName: inv.tenantName,
        amountPaise: ask,
        invoiceCount: 1,
        oldestInvoiceId: inv.id,
        oldestDueDate: inv.dueDate,
        daysOverdue: daysFrom(inv.dueDate, today),
      });
      continue;
    }
    item.amountPaise += ask;
    item.invoiceCount += 1;
    if (compareDates(inv.dueDate, item.oldestDueDate) < 0) {
      item.oldestInvoiceId = inv.id;
      item.oldestDueDate = inv.dueDate;
      item.sortDate = inv.dueDate;
      item.daysOverdue = daysFrom(inv.dueDate, today);
    }
  }
  return [...byTenant.values()];
}

/** The needs-attention list, most urgent first. */
export function needsAttention(input: AttentionInput): AttentionItem[] {
  const { today } = input;
  const items: AttentionItem[] = [...overdueByTenant(input.open, today)];
  if (input.thisMonthNotMade)
    items.push({
      kind: "not_made",
      key: `not_made:${input.thisMonthNotMade}`,
      sortDate: `${input.thisMonthNotMade}-01`,
      month: input.thisMonthNotMade,
    });
  // Invoices are dated the 1st of their month and can't be sent before it
  // (D23), so drafts made ahead for next month wait until then.
  for (const d of input.drafts) {
    if (d.count === 0 || compareDates(d.month, today) > 0) continue;
    items.push({
      kind: "not_sent",
      key: `not_sent:${d.month}`,
      sortDate: d.month,
      month: d.month,
      count: d.count,
      totalPaise: d.totalPaise,
    });
  }
  if (input.bankLinesToMatch > 0)
    items.push({
      kind: "bank_lines",
      key: "bank_lines",
      sortDate: today,
      count: input.bankLinesToMatch,
    });
  if (input.tdsCertificatesMissing)
    items.push({
      kind: "tds_missing",
      key: "tds_missing",
      sortDate: today,
      ...input.tdsCertificatesMissing,
    });
  for (const d of input.dates) {
    if (!dateShows(d, today)) continue;
    items.push({
      kind: "date",
      key: `date:${d.id}`,
      sortDate: d.date,
      date: d,
      daysAway: daysFrom(today, d.date),
    });
  }
  return items.sort(
    (a, b) =>
      compareDates(a.sortDate, b.sortDate) ||
      RANK[a.kind] - RANK[b.kind] ||
      a.key.localeCompare(b.key),
  );
}

/**
 * The Today numbers that come from open invoices: everything unpaid on sent
 * invoices (TDS not yet recorded included), and how much of what tenants are
 * asked to pay is past its due date (the overdue list's total).
 */
export function unpaidTotals(
  open: readonly OpenInvoiceRow[],
  today: PlainDate,
): { unpaidPaise: Paise; overduePaise: Paise } {
  let unpaidPaise = 0;
  for (const inv of open) unpaidPaise += inv.outstandingPaise;
  const overduePaise = overdueByTenant(open, today).reduce(
    (sum, t) => sum + t.amountPaise,
    0,
  );
  return { unpaidPaise, overduePaise };
}

/** "today", "tomorrow", "in 12 days". */
export function inDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "1 day", "48 days". */
export function dayCount(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** What a lease date is, in the glossary's words. */
export function dateTitle(d: Pick<CriticalDateRow, "type" | "label">): string {
  switch (d.type) {
    case "expiry":
      return "Lease ends";
    case "lock_in_end":
      return "Lock-in ends";
    case "escalation":
      return "Rent increase";
    case "renewal_option":
      return "Renewal option";
    case "notice_deadline":
      return "Last day to give notice";
    case "custom":
      return d.label ?? "Lease date";
  }
}

/** How long "Remind me later" hides a lease date. */
export const SNOOZE_DAYS = 7;
