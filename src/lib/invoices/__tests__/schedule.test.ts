import { describe, expect, it } from "vitest";
import { scheduledRunMonth } from "../schedule";

describe("scheduledRunMonth", () => {
  it("makes this month's invoices on the 1st with the default run day", () => {
    expect(scheduledRunMonth("2026-11-01", 1)).toBe("2026-11");
    expect(scheduledRunMonth("2026-11-02", 1)).toBeNull();
  });

  it("makes next month's invoices on a later run day, across a year end", () => {
    expect(scheduledRunMonth("2026-10-25", 25)).toBe("2026-11");
    expect(scheduledRunMonth("2026-12-25", 25)).toBe("2027-01");
    expect(scheduledRunMonth("2026-10-24", 25)).toBeNull();
  });
});
