// The daily digest email (docs/PRODUCT_PLAN.md, Alerts: "daily email digest
// to each user for their items"). Pure: the job passes the organization's
// needs-attention list and its members; this decides who gets which items
// and writes the email (D36).

import type { PlainDate } from "@/lib/billing/dates";
import type { Role } from "@/lib/auth/membership";
import { can } from "@/lib/auth/roles";
import { brand } from "@/lib/config/brand";
import type { Email } from "@/lib/email";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import {
  dateTitle,
  dayCount,
  inDays,
  type AttentionItem,
  type CriticalDateRow,
} from "./attention";

export type DigestMember = { userId: string; email: string; role: Role };

/**
 * Whether a lease date is in today's email: on each of its reminder days,
 * on the day itself, and on the day a snooze ends. Between those it stays
 * on Today without being emailed again.
 */
export function remindsToday(
  d: CriticalDateRow,
  daysAway: number,
  today: PlainDate,
): boolean {
  return (
    daysAway === 0 ||
    d.remindDays.includes(daysAway) ||
    (d.status === "snoozed" && d.snoozedUntil === today)
  );
}

/**
 * Each member's items, in the list's order. Money (unpaid tenants, invoices
 * to make or send, bank lines, TDS certificates) goes to those who can act
 * on billing; a lease date to the person it is assigned to, or, if nobody
 * (still on the team, and not a viewer) is, to those who can change leases. Viewers get
 * nothing. Members with no items are left out: nobody gets an empty email.
 */
export function digestsFor(
  members: readonly DigestMember[],
  items: readonly AttentionItem[],
  today: PlainDate,
): { member: DigestMember; items: AttentionItem[] }[] {
  // Someone who can change nothing (a viewer) can't act on a date, so an
  // assignment to them counts as no assignment.
  const canAct = (m: DigestMember) =>
    can(m.role, "manage_billing") || can(m.role, "manage_leases");
  const onTeam = new Set(members.filter(canAct).map((m) => m.userId));
  return members
    .map((member) => ({
      member,
      items: items.filter((item) => {
        if (item.kind !== "date") return can(member.role, "manage_billing");
        const d = item.date;
        const assigned =
          d.assignedTo && onTeam.has(d.assignedTo) ? d.assignedTo : null;
        if (
          assigned
            ? assigned !== member.userId
            : !can(member.role, "manage_leases")
        )
          return false;
        return remindsToday(d, item.daysAway, today);
      }),
    }))
    .filter((d) => d.items.length > 0);
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** One item as a sentence. */
export function digestLine(item: AttentionItem): string {
  switch (item.kind) {
    case "overdue":
      return `${item.tenantName} hasn't paid ${formatINR(item.amountPaise)}. ${
        item.invoiceCount > 1
          ? `${item.invoiceCount} invoices unpaid, the oldest was due`
          : "The invoice was due"
      } ${formatDate(item.oldestDueDate)} (${dayCount(item.daysOverdue)} ago).`;
    case "not_made":
      return `${formatMonth(item.month)} invoices aren't made yet.`;
    case "not_sent":
      return `${plural(item.count, `${formatMonth(item.month)} invoice`, `${formatMonth(item.month)} invoices`)} not sent yet, ${formatINR(item.totalPaise)} in all.`;
    case "bank_lines":
      return `${plural(item.count, "bank line", "bank lines")} to match.`;
    case "tds_missing":
      return `${plural(item.count, "TDS certificate", "TDS certificates")} missing, past their due date.`;
    case "date":
      return `${dateTitle(item.date)} ${inDays(item.daysAway)}: ${item.date.tenantName}, ${item.date.buildingName} (${formatDate(item.date.date)}).`;
  }
}

/** The digest email for one member. */
export function digestEmail(input: {
  organizationName: string;
  to: string;
  today: PlainDate;
  items: readonly AttentionItem[];
  /** The app's address, e.g. "https://app.example.in"; without it, no link. */
  appUrl?: string;
}): Email {
  const { organizationName: org, items } = input;
  const money = items.filter((i) => i.kind !== "date");
  const dates = items.filter((i) => i.kind === "date");
  const lines = [
    "Good morning,",
    "",
    `Here is what needs attention at ${org} today, ${formatDate(input.today)}.`,
  ];
  if (money.length > 0)
    lines.push("", "Money", ...money.map((i) => `- ${digestLine(i)}`));
  if (dates.length > 0)
    lines.push("", "Lease dates", ...dates.map((i) => `- ${digestLine(i)}`));
  lines.push(
    "",
    input.appUrl
      ? `Open Today to act on these: ${input.appUrl.replace(/\/+$/, "")}/today`
      : `Open ${brand.name} and go to Today to act on these.`,
    "",
    `You get this email because you're on the ${org} team in ${brand.name}. An owner can turn it off in Settings → Billing rules.`,
  );
  return {
    to: [input.to],
    subject: `${org}: ${plural(items.length, "thing needs", "things need")} attention today`,
    text: lines.join("\n"),
  };
}
