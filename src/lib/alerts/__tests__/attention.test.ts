import { describe, expect, it } from "vitest";
import {
  dateShows,
  dateTitle,
  inDays,
  mainActionKey,
  needsAttention,
  overdueByTenant,
  unpaidTotals,
  type CriticalDateRow,
  type OpenInvoiceRow,
} from "../attention";

const today = "2026-10-23";

const inv = (o: Partial<OpenInvoiceRow> & { id: string }): OpenInvoiceRow => ({
  tenantId: "t1",
  tenantName: "Acme",
  dueDate: "2026-10-08",
  outstandingPaise: 118_000_00,
  expectedTdsPaise: 0,
  ...o,
});

const date = (
  o: Partial<CriticalDateRow> & { id: string },
): CriticalDateRow => ({
  leaseId: "l1",
  tenantName: "Acme",
  buildingName: "Tower A",
  type: "expiry",
  date: "2027-01-31",
  remindDays: [180, 90, 30],
  status: "open",
  snoozedUntil: null,
  label: null,
  assignedTo: null,
  ...o,
});

const empty = {
  today,
  open: [],
  drafts: [],
  thisMonthNotMade: null,
  dates: [],
  bankLinesToMatch: 0,
  tdsCertificatesMissing: null,
};

describe("dateShows", () => {
  it("shows a date from its longest reminder up to the day itself", () => {
    // Escalation on 22-11-2026 with reminders at 30 and 7 days: shows from
    // 23-10-2026 (30 days before) to 22-11-2026.
    const d = date({
      id: "d",
      type: "escalation",
      date: "2026-11-22",
      remindDays: [30, 7],
    });
    expect(dateShows(d, "2026-10-22")).toBe(false);
    expect(dateShows(d, "2026-10-23")).toBe(true);
    expect(dateShows(d, "2026-11-22")).toBe(true);
    expect(dateShows(d, "2026-11-23")).toBe(false);
  });

  it("hides done dates, and snoozed ones until the snooze ends", () => {
    const d = date({ id: "d", date: "2026-11-30" });
    expect(dateShows({ ...d, status: "done" }, today)).toBe(false);
    const snoozed = {
      ...d,
      status: "snoozed" as const,
      snoozedUntil: "2026-10-30",
    };
    expect(dateShows(snoozed, "2026-10-29")).toBe(false);
    expect(dateShows(snoozed, "2026-10-30")).toBe(true);
  });

  it("never shows a date with no reminder days", () => {
    expect(
      dateShows(date({ id: "d", date: today, remindDays: [] }), today),
    ).toBe(false);
  });
});

describe("overdueByTenant", () => {
  it("groups a tenant's past-due invoices and asks for what is left less expected TDS", () => {
    // Acme: ₹1,18,000 due 08-10 (₹10,000 TDS expected, so ₹1,08,000 asked)
    // and ₹50,000 due 08-09: ₹1,58,000 asked, oldest 08-09, 45 days ago.
    const items = overdueByTenant(
      [
        inv({ id: "a", expectedTdsPaise: 10_000_00 }),
        inv({ id: "b", dueDate: "2026-09-08", outstandingPaise: 50_000_00 }),
      ],
      today,
    );
    expect(items).toEqual([
      expect.objectContaining({
        tenantId: "t1",
        amountPaise: 158_000_00,
        invoiceCount: 2,
        oldestInvoiceId: "b",
        oldestDueDate: "2026-09-08",
        daysOverdue: 45,
      }),
    ]);
  });

  it("leaves out invoices due today or later, and ones with only TDS left", () => {
    expect(
      overdueByTenant(
        [
          inv({ id: "a", dueDate: today }),
          inv({
            id: "b",
            outstandingPaise: 5_000_00,
            expectedTdsPaise: 5_000_00,
          }),
        ],
        today,
      ),
    ).toEqual([]);
  });
});

describe("unpaidTotals", () => {
  it("adds everything unpaid, and the overdue amount asked for", () => {
    // Unpaid: 1,18,000 + 50,000 (due later) = 1,68,000.
    // Overdue: 1,18,000 - 10,000 TDS expected = 1,08,000.
    expect(
      unpaidTotals(
        [
          inv({ id: "a", expectedTdsPaise: 10_000_00 }),
          inv({ id: "b", dueDate: "2026-11-08", outstandingPaise: 50_000_00 }),
        ],
        today,
      ),
    ).toEqual({ unpaidPaise: 168_000_00, overduePaise: 108_000_00 });
  });
});

describe("needsAttention", () => {
  it("is empty when nothing needs doing", () => {
    expect(needsAttention(empty)).toEqual([]);
  });

  it("orders by date, with money before lease dates on the same day", () => {
    const items = needsAttention({
      ...empty,
      open: [inv({ id: "a", dueDate: "2026-09-08" })],
      drafts: [
        { month: "2026-10-01", count: 3, totalPaise: 300_00 },
        // Made ahead for November: can't be sent before 01-11.
        { month: "2026-11-01", count: 40, totalPaise: 4_000_00 },
      ],
      bankLinesToMatch: 4,
      tdsCertificatesMissing: { count: 2, financialYear: "2026-27" },
      dates: [
        date({ id: "late", date: "2027-01-31" }),
        date({
          id: "soon",
          type: "escalation",
          date: today,
          remindDays: [30, 7],
        }),
        date({ id: "done", status: "done", date: "2026-11-01" }),
      ],
    });
    expect(items.map((i) => i.key)).toEqual([
      "overdue:t1",
      "not_sent:2026-10-01",
      "bank_lines",
      "tds_missing",
      "date:soon",
      "date:late",
    ]);
    const late = items.at(-1);
    expect(late?.kind === "date" && late.daysAway).toBe(100);
  });

  it("asks for this month's invoices when none are made", () => {
    expect(needsAttention({ ...empty, thisMonthNotMade: "2026-10" })).toEqual([
      {
        kind: "not_made",
        key: "not_made:2026-10",
        sortDate: "2026-10-01",
        month: "2026-10",
      },
    ]);
  });
});

describe("mainActionKey", () => {
  it("gives the filled button to the first item to make or send invoices", () => {
    // September's drafts still waiting, and October's: one main button,
    // on the older month, which comes first on the list.
    const items = needsAttention({
      ...empty,
      open: [inv({ id: "a", dueDate: "2026-09-08" })],
      drafts: [
        { month: "2026-09-01", count: 2, totalPaise: 200_00 },
        { month: "2026-10-01", count: 3, totalPaise: 300_00 },
      ],
    });
    expect(mainActionKey(items)).toBe("not_sent:2026-09-01");
    expect(mainActionKey([])).toBeNull();
  });
});

describe("words", () => {
  it("says when, and what the date is", () => {
    expect([inDays(0), inDays(1), inDays(12)]).toEqual([
      "today",
      "tomorrow",
      "in 12 days",
    ]);
    expect(dateTitle({ type: "escalation", label: null })).toBe(
      "Rent increase",
    );
    expect(dateTitle({ type: "custom", label: "Insurance renewal" })).toBe(
      "Insurance renewal",
    );
  });
});
