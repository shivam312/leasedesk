import { describe, expect, it } from "vitest";
import { amountToAsk, reminderDue, reminderToSend } from "../schedule";

// Invoice sent 01-11-2026, due 08-11-2026; default schedule: 3 days before
// (05-11), then 1, 7 and 15 days after (09-11, 15-11, 23-11).
const base = {
  sentOn: "2026-11-01",
  dueDate: "2026-11-08",
  beforeDueDays: [3],
  afterDueDays: [1, 7, 15],
  sent: [] as string[],
};

describe("reminderDue", () => {
  it("sends nothing before the first step", () => {
    expect(reminderDue({ ...base, today: "2026-11-04" })).toBeNull();
  });

  it("sends the before-due reminder on its day", () => {
    expect(reminderDue({ ...base, today: "2026-11-05" })).toEqual({
      step: "before:3",
      kind: "before",
      days: 3,
    });
  });

  it("sends nothing on the due date itself, or between steps", () => {
    const sent = ["before:3"];
    expect(reminderDue({ ...base, sent, today: "2026-11-06" })).toBeNull();
    expect(reminderDue({ ...base, sent, today: "2026-11-08" })).toBeNull();
  });

  it("sends each after-due reminder on its day", () => {
    expect(reminderDue({ ...base, today: "2026-11-09" })).toEqual({
      step: "after:1",
      kind: "after",
      days: 1,
    });
    expect(
      reminderDue({ ...base, sent: ["after:1"], today: "2026-11-15" }),
    ).toEqual({ step: "after:7", kind: "after", days: 7 });
    expect(
      reminderDue({
        ...base,
        sent: ["after:1", "after:7"],
        today: "2026-11-23",
      }),
    ).toEqual({ step: "after:15", kind: "after", days: 15 });
  });

  it("never sends a step twice", () => {
    expect(
      reminderDue({ ...base, sent: ["after:7"], today: "2026-11-15" }),
    ).toBeNull();
  });

  it("after the last step, sends nothing more", () => {
    const sent = ["before:3", "after:1", "after:7", "after:15"];
    expect(reminderDue({ ...base, sent, today: "2026-12-31" })).toBeNull();
  });

  it("catches up a missed day, but only the latest step, not a burst", () => {
    // The job didn't run on 15-11 or 16-11; on 17-11 after:7 (15-11) is 2 days
    // late, within the 3-day window. after:1 was never sent: skipped.
    expect(reminderDue({ ...base, today: "2026-11-17" })).toEqual({
      step: "after:7",
      kind: "after",
      days: 7,
    });
  });

  it("doesn't send a step more than 3 days late", () => {
    // after:7 was due 15-11; on 19-11 it's 4 days late.
    expect(reminderDue({ ...base, today: "2026-11-19" })).toBeNull();
  });

  it("doesn't send a before-due reminder once the due date has come", () => {
    // Due 08-11, step before:3 on 05-11, within the window on 08-11 but the
    // invoice is now due, so "due in 3 days" would be wrong.
    expect(
      reminderDue({ ...base, afterDueDays: [], today: "2026-11-08" }),
    ).toBeNull();
  });

  it("doesn't remind about a step that fell before the invoice was sent", () => {
    // Sent 07-11, due 08-11: before:3 (05-11) came before it was sent.
    expect(
      reminderDue({ ...base, sentOn: "2026-11-07", today: "2026-11-07" }),
    ).toBeNull();
  });

  it("takes the step lists in any order, with duplicates", () => {
    expect(
      reminderDue({
        ...base,
        afterDueDays: [15, 7, 7, 1],
        today: "2026-11-15",
      }),
    ).toEqual({ step: "after:7", kind: "after", days: 7 });
  });

  it("sends nothing when both lists are empty (reminders switched off)", () => {
    expect(
      reminderDue({
        ...base,
        beforeDueDays: [],
        afterDueDays: [],
        today: "2026-11-09",
      }),
    ).toBeNull();
  });

  it("a 0-day before step is the due date itself", () => {
    expect(
      reminderDue({ ...base, beforeDueDays: [0], today: "2026-11-08" }),
    ).toEqual({ step: "before:0", kind: "before", days: 0 });
  });
});

describe("amountToAsk", () => {
  it("asks for what is left less the TDS the tenant will still deduct", () => {
    // ₹1,38,060 left, TDS ₹11,700 still expected: ask ₹1,26,360.
    expect(
      amountToAsk({
        outstandingPaise: 13_806_000,
        expectedTdsPaise: 1_170_000,
      }),
    ).toBe(12_636_000);
  });

  it("asks for nothing when only the TDS is left", () => {
    expect(
      amountToAsk({ outstandingPaise: 1_170_000, expectedTdsPaise: 1_170_000 }),
    ).toBe(0);
  });

  it("never asks for less than nothing", () => {
    expect(
      amountToAsk({ outstandingPaise: 50_000, expectedTdsPaise: 1_170_000 }),
    ).toBe(0);
  });
});

describe("reminderToSend", () => {
  it("is the step due today with the amount to ask", () => {
    // Due 08-11, today 09-11: after:1. ₹1,38,060 left − ₹11,700 TDS = ₹1,26,360.
    expect(
      reminderToSend({
        ...base,
        today: "2026-11-09",
        outstandingPaise: 13_806_000,
        expectedTdsPaise: 1_170_000,
      }),
    ).toEqual({
      step: "after:1",
      kind: "after",
      days: 1,
      amountPaise: 12_636_000,
    });
  });

  it("is nothing when only the TDS is left to come", () => {
    expect(
      reminderToSend({
        ...base,
        today: "2026-11-09",
        outstandingPaise: 1_170_000,
        expectedTdsPaise: 1_170_000,
      }),
    ).toBeNull();
  });

  it("is nothing on a day without a step", () => {
    // after:1 (09-11) already went; after:7 is on 15-11.
    expect(
      reminderToSend({
        ...base,
        sent: ["after:1"],
        today: "2026-11-10",
        outstandingPaise: 13_806_000,
        expectedTdsPaise: 0,
      }),
    ).toBeNull();
  });
});
