import { describe, expect, it } from "vitest";
import type { AttentionItem, CriticalDateRow } from "../attention";
import {
  digestEmail,
  digestsFor,
  remindsToday,
  type DigestMember,
} from "../digest";

const today = "2026-10-23";

const owner: DigestMember = {
  userId: "u-owner",
  email: "owner@x.test",
  role: "owner",
};
const accounts: DigestMember = {
  userId: "u-acc",
  email: "acc@x.test",
  role: "accounts",
};
const manager: DigestMember = {
  userId: "u-pm",
  email: "pm@x.test",
  role: "property_manager",
};
const viewer: DigestMember = {
  userId: "u-view",
  email: "view@x.test",
  role: "viewer",
};

const leaseDate = (o: Partial<CriticalDateRow> = {}): CriticalDateRow => ({
  id: "d1",
  leaseId: "l1",
  tenantName: "Acme",
  buildingName: "Tower A",
  type: "escalation",
  date: "2026-11-22",
  remindDays: [30, 7],
  status: "open",
  snoozedUntil: null,
  label: null,
  assignedTo: null,
  ...o,
});

const dateItem = (
  daysAway: number,
  o: Partial<CriticalDateRow> = {},
): AttentionItem => ({
  kind: "date",
  key: `date:${o.id ?? "d1"}`,
  sortDate: "2026-11-22",
  date: leaseDate(o),
  daysAway,
});

const overdue: AttentionItem = {
  kind: "overdue",
  key: "overdue:t1",
  sortDate: "2026-09-08",
  tenantId: "t1",
  tenantName: "Acme",
  amountPaise: 108_000_00,
  invoiceCount: 2,
  oldestInvoiceId: "i1",
  oldestDueDate: "2026-09-08",
  oldestAmountPaise: 50_000_00,
  daysOverdue: 45,
};

describe("remindsToday", () => {
  it("emails a lease date on its reminder days, its own day and when a snooze ends", () => {
    // Rent increase 22-11-2026, reminders 30 and 7 days before.
    expect(remindsToday(leaseDate(), 30, today)).toBe(true);
    expect(remindsToday(leaseDate(), 29, today)).toBe(false);
    expect(remindsToday(leaseDate(), 7, today)).toBe(true);
    expect(remindsToday(leaseDate(), 0, today)).toBe(true);
    expect(
      remindsToday(
        leaseDate({ status: "snoozed", snoozedUntil: today }),
        12,
        today,
      ),
    ).toBe(true);
  });
});

describe("digestsFor", () => {
  it("gives money to owner and accounts, lease dates to owner and property manager, nothing to viewers", () => {
    const result = digestsFor(
      [owner, accounts, manager, viewer],
      [overdue, dateItem(30)],
      today,
    );
    expect(
      result.map((r) => [r.member.role, r.items.map((i) => i.kind)]),
    ).toEqual([
      ["owner", ["overdue", "date"]],
      ["accounts", ["overdue"]],
      ["property_manager", ["date"]],
    ]);
  });

  it("leaves out lease dates that aren't on a reminder day, and anyone left with nothing", () => {
    expect(digestsFor([manager], [dateItem(12)], today)).toEqual([]);
  });

  it("sends an assigned date only to that person, unless they've left the team", () => {
    const assigned = dateItem(7, { assignedTo: accounts.userId });
    expect(
      digestsFor([owner, accounts, manager], [assigned], today).map(
        (r) => r.member.role,
      ),
    ).toEqual(["accounts"]);
    const gone = dateItem(7, { assignedTo: "someone-removed" });
    expect(
      digestsFor([owner, manager], [gone], today).map((r) => r.member.role),
    ).toEqual(["owner", "property_manager"]);
  });

  it("never emails a viewer, even a date assigned to them", () => {
    const toViewer = dateItem(7, { assignedTo: viewer.userId });
    expect(
      digestsFor([owner, manager, viewer], [toViewer], today).map(
        (r) => r.member.role,
      ),
    ).toEqual(["owner", "property_manager"]);
  });
});

describe("digestEmail", () => {
  it("lists money, then lease dates, with a link to Today", () => {
    const email = digestEmail({
      organizationName: "Shah Estates",
      to: owner.email,
      today,
      items: [overdue, dateItem(30)],
      appUrl: "https://app.example.in/",
    });
    expect(email.to).toEqual(["owner@x.test"]);
    expect(email.subject).toBe("Shah Estates: 2 things need attention today");
    expect(email.text).toContain(
      "- Acme hasn't paid ₹1,08,000. 2 invoices unpaid, the oldest was due 08-09-2026 (45 days ago).",
    );
    expect(email.text).toContain(
      "Lease dates\n- Rent increase in 30 days: Acme, Tower A (22-11-2026).",
    );
    expect(email.text).toContain(
      "Open Today to act on these: https://app.example.in/today",
    );
  });

  it("says where to go when the app's address isn't set", () => {
    const email = digestEmail({
      organizationName: "Shah Estates",
      to: owner.email,
      today,
      items: [
        { kind: "bank_lines", key: "bank_lines", sortDate: today, count: 1 },
      ],
    });
    expect(email.subject).toBe("Shah Estates: 1 thing needs attention today");
    expect(email.text).toContain("- 1 bank line to match.");
    expect(email.text).toContain("go to Today to act on these.");
  });
});
