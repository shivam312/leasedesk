// gst.rounding (docs/SETTINGS.md, D-004) [CA], every option.

import { describe, expect, it } from "vitest";
import { invoiceTax, invoiceTotals } from "../gst";
import { DEFAULT_SETTINGS, withSettings } from "./billing-settings";

// Three lines of ₹100.05 at 18%.
const three = [10_005, 10_005, 10_005].map((taxablePaise) => ({
  taxablePaise,
  gstRateBp: 1800,
}));

const taxes = (
  lines: typeof three,
  gstRounding: "per_line" | "per_invoice",
  supply: "intra_state" | "inter_state" = "intra_state",
) =>
  invoiceTax(lines, supply, withSettings({ gstRounding })).map((l) => [
    l.cgst,
    l.sgst,
    l.igst,
  ]);

describe("gst.rounding", () => {
  it("per_line (default): each line rounded: 9% of ₹100.05 = 9.0045 → ₹9.00, CGST ₹27.00", () => {
    expect(taxes(three, "per_line")).toEqual([
      [900, 900, 0],
      [900, 900, 0],
      [900, 900, 0],
    ]);
    expect(invoiceTax(three, "intra_state", DEFAULT_SETTINGS)).toHaveLength(3);
  });

  it("per_invoice: once on the total: 9% of ₹300.15 = 27.0135 → ₹27.01; the extra paisa goes on the first largest line", () => {
    expect(taxes(three, "per_invoice")).toEqual([
      [901, 901, 0],
      [900, 900, 0],
      [900, 900, 0],
    ]);
  });

  it("per_invoice, IGST: 18% of ₹300.15 = 54.027 → ₹54.03 (lines: 18.009 → 18.01 each = 54.03, no change)", () => {
    expect(taxes(three, "per_invoice", "inter_state")).toEqual([
      [0, 0, 1801],
      [0, 0, 1801],
      [0, 0, 1801],
    ]);
  });

  it("per_invoice puts the difference on the largest line and keeps rates apart", () => {
    // 18%: ₹100.05 + ₹200.05 = ₹300.10; 9% = 27.009 → ₹27.01.
    //   Lines: 9.0045 → 9.00 and 18.0045 → 18.00 = 27.00, so +1 paisa on ₹200.05.
    // 12%: ₹100.05; 6% = 6.003 → ₹6.00 (one line: unchanged).
    const lines = [
      { taxablePaise: 10_005, gstRateBp: 1800 },
      { taxablePaise: 20_005, gstRateBp: 1800 },
      { taxablePaise: 10_005, gstRateBp: 1200 },
    ];
    expect(
      invoiceTax(
        lines,
        "intra_state",
        withSettings({ gstRounding: "per_invoice" }),
      ).map((l) => l.cgst),
    ).toEqual([900, 1801, 600]);
  });

  it("the invoice totals add up the line taxes either way", () => {
    // per_line: 27.00 + 27.00; per_invoice: 27.01 + 27.01; taxable ₹300.15
    const totals = (gstRounding: "per_line" | "per_invoice") =>
      invoiceTotals(
        invoiceTax(three, "intra_state", withSettings({ gstRounding })).map(
          (t, i) => ({ ...t, taxablePaise: three[i]!.taxablePaise }),
        ),
        withSettings({ roundInvoiceTotal: "none" }),
      ).grandTotal;
    expect(totals("per_line")).toBe(30_015 + 2_700 * 2);
    expect(totals("per_invoice")).toBe(30_015 + 2_701 * 2);
  });

  it("explains a per_invoice adjustment on the line that carries it", () => {
    const [first] = invoiceTax(
      three,
      "intra_state",
      withSettings({ gstRounding: "per_invoice" }),
    );
    expect(first?.explanation.steps.join("\n")).toContain("₹27.01");
  });
});

describe("gst.rounding per_invoice: edge cases", () => {
  const cgst = (lines: { taxablePaise: number; gstRateBp: number }[]) =>
    invoiceTax(
      lines,
      "intra_state",
      withSettings({ gstRounding: "per_invoice" }),
    ).map((t) => t.cgst);

  it("a credit note mirrors its invoice: the paisa stays on the ₹200.05 line", () => {
    // Invoice ₹100.05 + ₹200.05: CGST ₹9.00 + ₹18.01 (see above).
    // Credit note −₹100.05 + −₹200.05: per line −9.0045 → −₹9.00, −18.0045 → −₹18.00;
    // total 9% of −₹300.10 = −27.009 → −₹27.01; −₹0.01 on the larger line.
    expect(
      cgst([
        { taxablePaise: -10_005, gstRateBp: 1800 },
        { taxablePaise: -20_005, gstRateBp: 1800 },
      ]),
    ).toEqual([-900, -1801]);
  });

  it("equal-sized lines: the line key decides, so a credit note in another order matches", () => {
    // Invoice ₹200.05 (A) + ₹200.05 (B) + ₹100.05 (C) at 18%, same state.
    // Per line: 18.0045 → 18.00, 18.00, 9.0045 → 9.00 = ₹45.00.
    // Total: 9% of ₹500.15 = 45.0135 → ₹45.01, so +₹0.01 on one ₹200.05 line:
    // A and B tie on size, the lower key (A) takes it.
    const keyed = (sign: 1 | -1, keys: string[], amounts: number[]) =>
      invoiceTax(
        amounts.map((a, i) => ({
          taxablePaise: sign * a,
          gstRateBp: 1800,
          key: keys[i],
        })),
        "intra_state",
        withSettings({ gstRounding: "per_invoice" }),
      ).map((t) => t.cgst);
    expect(keyed(1, ["A", "B", "C"], [20_005, 20_005, 10_005])).toEqual([
      1801, 1800, 900,
    ]);
    // Credit note with the lines listed C, B, A: −₹0.01 still lands on A.
    expect(keyed(-1, ["C", "B", "A"], [10_005, 20_005, 20_005])).toEqual([
      -900, -1800, -1801,
    ]);
  });

  it("a tie between keyed and unkeyed lines doesn't depend on order", () => {
    // Three ₹200.05 lines: per line 18.0045 → 18.00 each = ₹54.00; total 9% of
    // ₹600.15 = 54.0135 → ₹54.01. Keyed lines first, then the lower key: A.
    const lines = [
      { taxablePaise: 20_005, gstRateBp: 1800, key: "B" },
      { taxablePaise: 20_005, gstRateBp: 1800 },
      { taxablePaise: 20_005, gstRateBp: 1800, key: "A" },
    ];
    const winner = (order: typeof lines) =>
      order[cgst(order).findIndex((c) => c === 1801)]!.key;
    expect(winner(lines)).toBe("A");
    expect(winner([lines[1]!, lines[2]!, lines[0]!])).toBe("A");
    expect(winner([lines[2]!, lines[0]!, lines[1]!])).toBe("A");
  });

  it("positive and negative lines at one rate: no difference, no change", () => {
    // 9% of ₹200.05 = 18.0045 → 18.00; 9% of −₹100.05 → −9.00; sum ₹9.00.
    // Total 9% of ₹100.00 = ₹9.00.
    expect(
      cgst([
        { taxablePaise: 20_005, gstRateBp: 1800 },
        { taxablePaise: -10_005, gstRateBp: 1800 },
      ]),
    ).toEqual([1800, -900]);
  });

  it("all ₹0 lines stay ₹0", () => {
    expect(
      cgst([
        { taxablePaise: 0, gstRateBp: 1800 },
        { taxablePaise: 0, gstRateBp: 1800 },
      ]),
    ).toEqual([0, 0]);
  });

  it("an odd rate: 12.5% → 6.25% each side", () => {
    // Per line 6.25% of ₹100.05 = 6.253125 → ₹6.25 × 3 = ₹18.75;
    // total 6.25% of ₹300.15 = 18.759375 → ₹18.76; +₹0.01 on the first line.
    expect(
      cgst(
        [10_005, 10_005, 10_005].map((t) => ({
          taxablePaise: t,
          gstRateBp: 1250,
        })),
      ),
    ).toEqual([626, 625, 625]);
  });

  it("a single line is the same as per_line", () => {
    expect(cgst([{ taxablePaise: 10_005, gstRateBp: 1800 }])).toEqual([900]);
  });

  it("the adjusted line's explanation shows its own tax and the difference", () => {
    const [first] = invoiceTax(
      three,
      "intra_state",
      withSettings({ gstRounding: "per_invoice" }),
    );
    expect(first?.explanation.steps).toContain(
      "CGST on this line: ₹9 + rounding difference ₹0.01 = ₹9.01, so the lines add up to the total",
    );
  });
});
