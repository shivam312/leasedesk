import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareDates,
  daysBetweenInclusive,
  daysInMonth,
  endOfMonth,
  financialYear,
  fyQuarter,
  isLeapYear,
  monthOf,
  monthsBetween,
  parseDate,
  startOfMonth,
} from "../dates";

describe("parseDate", () => {
  it("parses a valid plain date", () => {
    expect(parseDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("rejects invalid dates and timestamps", () => {
    for (const bad of [
      "2027-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-10-22T00:00:00Z",
      "22-10-2026",
    ]) {
      expect(() => parseDate(bad), bad).toThrow(RangeError);
    }
  });
});

describe("leap years and days in month", () => {
  it("follows the Gregorian rules", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it("counts actual days in each month", () => {
    expect(daysInMonth(2028, 2)).toBe(29); // February 2028
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 3)).toBe(31);
  });
});

describe("day arithmetic", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2027-01-01", 90)).toBe("2027-04-01");
  });

  it("counts days inclusive of both ends", () => {
    // 16–30 Sep = 15 days
    expect(daysBetweenInclusive("2026-09-16", "2026-09-30")).toBe(15);
    // 15 May–30 Jun = 17 + 30 = 47 days
    expect(daysBetweenInclusive("2026-05-15", "2026-06-30")).toBe(47);
    expect(daysBetweenInclusive("2026-09-16", "2026-09-16")).toBe(1);
  });

  it("rejects an end before the start", () => {
    expect(() => daysBetweenInclusive("2026-09-16", "2026-09-15")).toThrow(
      RangeError,
    );
  });

  it("compares dates", () => {
    expect(compareDates("2026-04-01", "2026-04-02")).toBe(-1);
    expect(compareDates("2026-04-01", "2026-04-01")).toBe(0);
    expect(compareDates("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("addMonths", () => {
  it("keeps the day when it exists", () => {
    expect(addMonths("2026-04-01", 12)).toBe("2027-04-01");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
  });

  it("goes backwards", () => {
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addMonths("2027-01-15", -12)).toBe("2026-01-15");
  });
});

describe("months", () => {
  it("finds the month, its first and last day", () => {
    expect(monthOf("2026-09-16")).toBe("2026-09");
    expect(startOfMonth("2026-09")).toBe("2026-09-01");
    expect(endOfMonth("2028-02")).toBe("2028-02-29");
    expect(endOfMonth("2026-12")).toBe("2026-12-31");
  });

  it("lists the months a date range touches", () => {
    expect(monthsBetween("2026-11-20", "2027-02-03")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsBetween("2026-09-16", "2026-09-30")).toEqual(["2026-09"]);
  });
});

describe("financial year and quarters", () => {
  it("runs April to March", () => {
    expect(financialYear("2026-04-01")).toEqual({
      startYear: 2026,
      label: "2026-27",
      short: "26-27",
    });
    expect(financialYear("2026-03-31").label).toBe("2025-26");
    expect(financialYear("2099-12-31").short).toBe("99-00");
  });

  it("splits the year into Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar", () => {
    expect(fyQuarter("2026-05-15")).toEqual({
      fyStartYear: 2026,
      quarter: 1,
      start: "2026-04-01",
      end: "2026-06-30",
    });
    expect(fyQuarter("2026-09-30").quarter).toBe(2);
    expect(fyQuarter("2026-10-01").quarter).toBe(3);
    expect(fyQuarter("2027-01-15")).toEqual({
      fyStartYear: 2026,
      quarter: 4,
      start: "2027-01-01",
      end: "2027-03-31",
    });
  });
});
