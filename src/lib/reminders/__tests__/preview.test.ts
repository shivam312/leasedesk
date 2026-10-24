import { describe, expect, it } from "vitest";
import { reminderPreview } from "../preview";

describe("reminderPreview", () => {
  it("lists each reminder with its date, for an invoice of 01-11-2026 due in 7 days", () => {
    // Due 08-11-2026: 3 days before = 05-11; 1, 7 and 15 days after =
    // 09-11, 15-11 and 23-11.
    const p = reminderPreview({
      beforeDueDays: [3],
      afterDueDays: [1, 7, 15],
      invoiceDate: "2026-11-01",
      dueDays: 7,
      businessName: "Sharma Estates",
    });
    expect(p.timeline.map((t) => [t.date, t.when])).toEqual([
      ["2026-11-05", "3 days before the due date"],
      ["2026-11-09", "1 day after the due date"],
      ["2026-11-15", "7 days after the due date"],
      ["2026-11-23", "15 days after the due date"],
    ]);
    expect(p.timeline[0]!.subject).toBe(
      "Reminder: invoice SCT/26-27/0001 for ₹1,06,200 is due on 08-11-2026",
    );
    expect(p.sample!.subject).toBe(
      "Overdue: invoice SCT/26-27/0001, ₹1,06,200 was due on 08-11-2026",
    );
    expect(p.sample!.text).toContain("Regards,\nSharma Estates");
  });

  it("drops a step that would come before the invoice is sent", () => {
    // Due the same day it's dated: "3 days before" would be 29-10.
    const p = reminderPreview({
      beforeDueDays: [3],
      afterDueDays: [],
      invoiceDate: "2026-11-01",
      dueDays: 0,
      businessName: "X",
    });
    expect(p.timeline).toEqual([]);
    expect(p.sample).toBeNull();
  });
});
