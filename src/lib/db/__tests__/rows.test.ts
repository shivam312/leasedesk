import { describe, expect, it } from "vitest";
import { paiseSum } from "../rows";

// Postgres sums a bigint column as `numeric`, which arrives as a string.
describe("paiseSum", () => {
  it("reads a sum of paise exactly", () => {
    // ₹1,38,060 = 1,38,060 × 100 = 1,38,06,000 paise.
    expect(paiseSum("13806000")).toBe(13_806_000);
    expect(paiseSum("-1170000")).toBe(-1_170_000);
    expect(paiseSum("0")).toBe(0);
  });

  it("accepts the largest safe total", () => {
    // 2^53 - 1 = 9,007,199,254,740,991 is the last integer a number holds exactly.
    expect(paiseSum("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(paiseSum("-9007199254740991")).toBe(Number.MIN_SAFE_INTEGER);
  });

  it("refuses a total a number can't hold exactly", () => {
    // 2^53 + 1 = 9,007,199,254,740,993 would silently become ...992.
    expect(() => paiseSum("9007199254740993")).toThrow(RangeError);
    expect(() => paiseSum("9007199254740992")).toThrow(RangeError);
    expect(() => paiseSum("-9007199254740992")).toThrow(RangeError);
  });

  it("refuses anything that isn't a whole number of paise", () => {
    expect(() => paiseSum("12.5")).toThrow(RangeError);
    expect(() => paiseSum("abc")).toThrow(RangeError);
    expect(() => paiseSum("")).toThrow(RangeError);
  });
});
