import { describe, expect, it } from "vitest";
import { depositHeld, depositProblem, depositSettlement } from "../deposit";

const e = (
  kind: "received" | "refunded" | "adjusted" | "forfeited",
  amount: number,
  date = "2026-01-01",
) => ({
  kind,
  amount,
  date,
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
  const held = [e("received", 1_00_000_00, "2026-01-01")];
  it("never lets more go out than is held", () => {
    expect(depositProblem(held, "refunded", 1_00_000_00, "2026-06-01")).toBe(
      null,
    );
    expect(depositProblem(held, "refunded", 1_00_000_01, "2026-06-01")).toBe(
      "Only ₹1,00,000 of the deposit is held.",
    );
    expect(depositProblem([], "forfeited", 100, "2026-06-01")).toBe(
      "No deposit is held for this lease yet.",
    );
  });

  it("checks what was held on the entry's date, not just today", () => {
    // ₹1,00,000 received 01-01, ₹2,00,000 more on 01-03. A refund of
    // ₹2,50,000 dated 15-01 is refused: only ₹1,00,000 was held then.
    const two = [...held, e("received", 2_00_000_00, "2026-03-01")];
    expect(depositProblem(two, "refunded", 2_50_000_00, "2026-01-15")).toBe(
      "Only ₹1,00,000 of the deposit was held on 15-01-2026.",
    );
    expect(depositProblem(two, "refunded", 2_50_000_00, "2026-03-01")).toBe(
      null,
    );
    // Dated before anything came in.
    expect(depositProblem(two, "refunded", 100, "2025-12-31")).toBe(
      "Nothing was held on 31-12-2025. Check the date.",
    );
    // A backdated outflow can't leave a later one short: ₹80,000 refunded
    // 01-06 after the ₹3,00,000; a new ₹2,50,000 forfeit dated 01-04 would
    // leave ₹50,000 for the June refund.
    const later = [...two, e("refunded", 80_000_00, "2026-06-01")];
    expect(depositProblem(later, "forfeited", 2_50_000_00, "2026-04-01")).toBe(
      "That would leave only ₹50,000 for the ₹80,000 paid out on 01-06-2026.",
    );
    expect(depositProblem(later, "forfeited", 2_20_000_00, "2026-04-01")).toBe(
      null,
    );
  });

  it("needs a positive whole amount", () => {
    expect(depositProblem(held, "received", 0, "2026-06-01")).toBe(
      "Enter an amount above ₹0.",
    );
    expect(depositProblem(held, "received", 1.5, "2026-06-01")).toBe(
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
