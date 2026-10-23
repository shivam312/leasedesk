import { describe, expect, it } from "vitest";
import { describeValue } from "../billing-rules";

describe("describeValue", () => {
  it("shows rupee settings with Indian grouping (formatINR)", () => {
    // 1,00,000 rupees = 1,00,00,000 paise.
    expect(describeValue("tds.tolerancePaise", 10_000_000)).toBe("₹1,00,000");
    expect(describeValue("tds.tolerancePaise", 100)).toBe("₹1");
    expect(describeValue("tds.tolerancePaise", 150)).toBe("₹1.50");
  });
});
