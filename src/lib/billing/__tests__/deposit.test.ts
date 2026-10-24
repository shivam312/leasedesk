import { describe, expect, it } from "vitest";
import { depositHeld, depositProblem, depositSettlement } from "../deposit";

const e = (
  kind: "received" | "refunded" | "adjusted" | "forfeited",
  amount: number,
) => ({
  kind,
  amount,
});

describe("depositHeld", () => {
  it("is what was received less what was refunded, adjusted or forfeited", () => {
    // ₹3,00,000 received in two parts; ₹50,000 adjusted against dues;
    // ₹20,000 forfeited: ₹2,30,000 held.
    expect(
      depositHeld([
        e("received", 2_00_000_00),
        e("received", 1_00_000_00),
        e("adjusted", 50_000_00),
        e("forfeited", 20_000_00),
      ]),
    ).toBe(2_30_000_00);
    expect(depositHeld([])).toBe(0);
  });
});

describe("depositProblem", () => {
  const held = [e("received", 1_00_000_00)];
  it("never lets more go out than is held", () => {
    expect(depositProblem(held, "refunded", 1_00_000_00)).toBeNull();
    expect(depositProblem(held, "refunded", 1_00_000_01)).toBe(
      "Only ₹1,00,000 of the deposit is held.",
    );
    expect(depositProblem([], "forfeited", 100)).toBe(
      "No deposit is held for this lease yet.",
    );
  });

  it("needs a positive whole amount", () => {
    expect(depositProblem(held, "received", 0)).toBe(
      "Enter an amount above ₹0.",
    );
    expect(depositProblem(held, "received", 1.5)).toBe(
      "Enter an amount above ₹0.",
    );
  });
});

describe("depositSettlement", () => {
  it("uses the deposit for dues first, and refunds the rest", () => {
    // Held ₹3,00,000; ₹1,18,000 unpaid: adjust ₹1,18,000, refund ₹1,82,000.
    expect(depositSettlement(3_00_000_00, 1_18_000_00)).toEqual({
      adjustPaise: 1_18_000_00,
      refundPaise: 1_82_000_00,
      stillOwedPaise: 0,
    });
  });

  it("leaves the tenant owing what the deposit doesn't cover", () => {
    // Held ₹1,00,000; ₹1,18,000 unpaid: all adjusted, ₹18,000 still owed.
    expect(depositSettlement(1_00_000_00, 1_18_000_00)).toEqual({
      adjustPaise: 1_00_000_00,
      refundPaise: 0,
      stillOwedPaise: 18_000_00,
    });
  });
});
