import { describe, expect, it } from "vitest";
import {
  needsAttention,
  todayList,
  type CriticalDateRow,
  type OpenInvoiceRow,
} from "../attention";

const today = "2026-10-23";

const empty = {
  today,
  open: [],
  drafts: [],
  thisMonthNotMade: null,
  dates: [],
  bankLinesToMatch: 0,
  tdsCertificatesMissing: null,
};

/** Tenant n owes ₹1,000 × n, due n days before 08-10-2026 (so tenant 7 is oldest). */
const owing = (n: number): OpenInvoiceRow => ({
  id: `i${n}`,
  tenantId: `t${n}`,
  tenantName: `Tenant ${n}`,
  dueDate: `2026-10-${String(8 - n).padStart(2, "0")}`,
  outstandingPaise: n * 1_000_00,
  expectedTdsPaise: 0,
});

const increase = (
  id: string,
  date: string,
  type: CriticalDateRow["type"] = "escalation",
): CriticalDateRow => ({
  id,
  leaseId: `l-${id}`,
  tenantName: `Tenant ${id}`,
  buildingName: "Tower A",
  type,
  date,
  remindDays: [30],
  status: "open",
  snoozedUntil: null,
  label: null,
  assignedTo: null,
});

describe("todayList", () => {
  it("shows the 5 oldest unpaid tenants, then one card with the total and the count", () => {
    const items = todayList(
      needsAttention({ ...empty, open: [1, 2, 3, 4, 5, 6, 7].map(owing) }),
    );
    expect(items.map((i) => i.key)).toEqual([
      "overdue:t7",
      "overdue:t6",
      "overdue:t5",
      "overdue:t4",
      "overdue:t3",
      "overdue_all",
    ]);
    // ₹1,000 × (1 + 2 + … + 7) = ₹28,000 from all 7, not just the 5 shown.
    expect(items.at(-1)).toMatchObject({
      kind: "overdue_all",
      count: 7,
      totalPaise: 28_000_00,
    });
  });

  it("adds no total card for 5 or fewer", () => {
    const items = todayList(
      needsAttention({ ...empty, open: [1, 2, 3, 4, 5].map(owing) }),
    );
    expect(items.map((i) => i.kind)).toEqual(Array(5).fill("overdue"));
  });

  it("puts rent increases due the same day on one card", () => {
    const items = todayList(
      needsAttention({
        ...empty,
        dates: [
          increase("a", "2026-11-01"),
          increase("b", "2026-11-01"),
          increase("c", "2026-11-05"),
          increase("d", "2026-11-01", "expiry"),
        ],
      }),
    );
    expect(items.map((i) => i.key)).toEqual([
      "increases:2026-11-01",
      "date:d",
      "date:c",
    ]);
    const [shared] = items;
    expect(shared).toMatchObject({ kind: "increases", daysAway: 9 });
    expect(
      shared!.kind === "increases" && shared!.dates.map((d) => d.id),
    ).toEqual(["a", "b"]);
  });
});
