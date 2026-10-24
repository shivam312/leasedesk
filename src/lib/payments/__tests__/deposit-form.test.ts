import { describe, expect, it } from "vitest";
import { depositEntrySchema } from "../deposit-form";

describe("depositEntrySchema", () => {
  it("reads the amount in rupees as paise", () => {
    expect(
      depositEntrySchema.parse({
        kind: "received",
        date: "2026-11-20",
        amount: "₹3,00,000.50",
        reference: " UTR123 ",
        note: "",
      }),
    ).toEqual({
      kind: "received",
      date: "2026-11-20",
      amount: 3_00_000_50,
      reference: "UTR123",
      note: null,
    });
  });

  it("refuses ₹0, words and an unknown kind", () => {
    const base = {
      kind: "received",
      date: "2026-11-20",
      reference: "",
      note: "",
    };
    expect(depositEntrySchema.safeParse({ ...base, amount: "0" }).success).toBe(
      false,
    );
    expect(
      depositEntrySchema.safeParse({ ...base, amount: "lots" }).success,
    ).toBe(false);
    expect(
      depositEntrySchema.safeParse({ ...base, kind: "gift", amount: "1" })
        .success,
    ).toBe(false);
  });
});
