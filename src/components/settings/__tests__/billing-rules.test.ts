import { describe, expect, it } from "vitest";
import { describeValue } from "../billing-rules";

describe("describeValue", () => {
  it("shows rupee settings with Indian grouping (formatINR)", () => {
    // 1,00,000 rupees = 1,00,00,000 paise.
    expect(describeValue("tds.tolerancePaise", 10_000_000)).toBe("₹1,00,000");
    expect(describeValue("tds.tolerancePaise", 100)).toBe("₹1");
    expect(describeValue("tds.tolerancePaise", 150)).toBe("₹1.50");
  });

  it("shows the run day as a day of the month", () => {
    expect(describeValue("invoice.runDay", 1)).toBe("The 1st");
    expect(describeValue("invoice.runDay", 22)).toBe("The 22nd");
    expect(describeValue("invoice.runDay", 13)).toBe("The 13th");
    expect(describeValue("invoice.runDay", 25)).toBe("The 25th");
  });

  it("says day or days to match the number", () => {
    expect(describeValue("invoice.dueDays", 1)).toBe("1 day");
    expect(describeValue("invoice.dueDays", 7)).toBe("7 days");
    expect(describeValue("invoice.dueDays", 0)).toBe("0 days");
  });
});
