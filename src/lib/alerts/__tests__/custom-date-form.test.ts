import { describe, expect, it } from "vitest";
import { customDateSchema } from "../custom-date-form";

describe("customDateSchema", () => {
  it("reads the label, date and reminder days, longest first", () => {
    expect(
      customDateSchema.parse({
        label: " Rent review ",
        date: "2027-04-01",
        remind: "7, 30",
      }),
    ).toEqual({ label: "Rent review", date: "2027-04-01", remind: [30, 7] });
  });

  it("reminds 30 and 7 days before when left blank", () => {
    expect(
      customDateSchema.parse({
        label: "Insurance",
        date: "2027-04-01",
        remind: "",
      }).remind,
    ).toEqual([30, 7]);
  });

  it("refuses a missing label, a bad date and odd days", () => {
    expect(
      customDateSchema.safeParse({ label: "", date: "2027-04-01", remind: "" })
        .success,
    ).toBe(false);
    expect(
      customDateSchema.safeParse({
        label: "Review",
        date: "01-04-2027",
        remind: "",
      }).success,
    ).toBe(false);
    expect(
      customDateSchema.safeParse({
        label: "Review",
        date: "2027-04-01",
        remind: "seven",
      }).success,
    ).toBe(false);
  });
});
