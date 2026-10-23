import { describe, expect, it } from "vitest";
import { todayInIndia } from "../today";

describe("todayInIndia", () => {
  it("turns over at midnight in India, not UTC", () => {
    // 18:29 UTC is 23:59 IST; 18:30 UTC is 00:00 IST the next day.
    expect(todayInIndia(new Date("2026-03-31T18:29:00Z"))).toBe("2026-03-31");
    expect(todayInIndia(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
  });
});
