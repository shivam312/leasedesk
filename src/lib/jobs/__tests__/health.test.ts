import { describe, expect, it } from "vitest";
import { dailyRunLateSince } from "../health";

describe("dailyRunLateSince", () => {
  it("is on time when the last run was today or yesterday", () => {
    expect(
      dailyRunLateSince("2026-10-24", "2026-01-01", "2026-10-24"),
    ).toBeNull();
    // Before 06:00, today's run hasn't happened yet: yesterday's is fine.
    expect(
      dailyRunLateSince("2026-10-23", "2026-01-01", "2026-10-24"),
    ).toBeNull();
  });

  it("is late from the last run once a whole day is missed", () => {
    expect(dailyRunLateSince("2026-10-22", "2026-01-01", "2026-10-24")).toBe(
      "2026-10-22",
    );
  });

  it("counts from the day the account started when it never ran", () => {
    expect(dailyRunLateSince(null, "2026-10-24", "2026-10-24")).toBeNull();
    expect(dailyRunLateSince(null, "2026-10-20", "2026-10-24")).toBe(
      "2026-10-20",
    );
  });
});
