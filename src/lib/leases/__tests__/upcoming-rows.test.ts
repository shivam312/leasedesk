import { describe, expect, it } from "vitest";
import { upcomingRows } from "../review";

// A lease billed Jan 2026 to Dec 2028: 36 monthly rows.
const rows = Array.from({ length: 36 }, (_, i) => ({
  month: `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
}));
const months = (r: { month: string }[]) => r.map((x) => x.month);

describe("upcomingRows", () => {
  it("is the next 12 months from this one", () => {
    const shown = months(upcomingRows(rows, "2026-10"));
    expect(shown).toHaveLength(12);
    expect(shown[0]).toBe("2026-10");
    expect(shown.at(-1)).toBe("2027-09");
  });

  it("is the first 12 before the lease starts, and the last 12 after it ends", () => {
    expect(months(upcomingRows(rows, "2025-06"))[0]).toBe("2026-01");
    expect(months(upcomingRows(rows, "2029-03"))).toEqual(
      months(rows.slice(24)),
    );
  });

  it("is fewer near the end of the lease", () => {
    expect(months(upcomingRows(rows, "2028-11"))).toEqual([
      "2028-11",
      "2028-12",
    ]);
  });
});
