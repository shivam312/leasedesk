import { describe, expect, it } from "vitest";
import { firstNumber, invoiceNumber } from "../number";

describe("invoiceNumber", () => {
  it("uses {prefix}/{fy}/{seq} by default, the sequence padded to 4 digits", () => {
    expect(
      invoiceNumber({ prefix: "ABC", invoiceDate: "2026-11-01", sequence: 7 }),
    ).toBe("ABC/26-27/0007");
    // 1 Apr starts a new financial year
    expect(
      invoiceNumber({ prefix: "ABC", invoiceDate: "2027-04-01", sequence: 1 }),
    ).toBe("ABC/27-28/0001");
  });

  it("follows the billing entity's format (invoice.numberFormat)", () => {
    expect(
      invoiceNumber({
        format: "INV-{seq}/{fy}",
        prefix: "ABC",
        invoiceDate: "2026-11-01",
        sequence: 412,
      }),
    ).toBe("INV-0412/26-27");
  });

  it("refuses a number over 16 characters or with other characters", () => {
    expect(() =>
      invoiceNumber({
        format: "{prefix}-{fy}-{seq}-RENT",
        prefix: "ABCDE",
        invoiceDate: "2026-11-01",
        sequence: 1,
      }),
    ).toThrow(/16/);
    expect(() =>
      invoiceNumber({ prefix: "A B", invoiceDate: "2026-11-01", sequence: 1 }),
    ).toThrow(/letters, digits/);
  });
});

describe("firstNumber", () => {
  it("starts at 1, or where the landlord's numbering got to (invoice.startingNumber)", () => {
    expect(firstNumber({}, "2026-11-01")).toBe(1);
    expect(firstNumber({ "2026-27": 412 }, "2026-11-01")).toBe(412);
    // A different year starts at 1 again
    expect(firstNumber({ "2026-27": 412 }, "2027-04-01")).toBe(1);
  });
});
