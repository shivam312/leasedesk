import { describe, expect, it } from "vitest";
import {
  amountToPaise,
  paiseToField,
  parseCreditNoteForm,
} from "../credit-note-form";

const ID = "6f1c2a3b-4d5e-4f60-8a1b-2c3d4e5f6a7b";

describe("amountToPaise", () => {
  it("reads rupees with Indian grouping, ₹ and spaces; blank is nothing", () => {
    expect(amountToPaise("1,18,000.50")).toBe(11800050);
    expect(amountToPaise("₹ 500")).toBe(50000);
    expect(amountToPaise("")).toBe(0);
    expect(amountToPaise("12.345")).toBeNull();
    expect(amountToPaise("-5")).toBeNull();
  });

  it("round-trips with paiseToField", () => {
    expect(paiseToField(1250050)).toBe("12500.50");
    expect(paiseToField(1200000)).toBe("12000");
    expect(paiseToField(5)).toBe("0.05");
    expect(amountToPaise(paiseToField(10691775))).toBe(10691775);
  });
});

describe("parseCreditNoteForm", () => {
  it("reads the reason, note and each line's amount", () => {
    expect(
      parseCreditNoteForm([
        ["invoiceId", ID],
        ["reason", "waiver"],
        ["note", "  Lift out of service "],
        ["line_a", "5,000"],
        ["line_b", ""],
      ]),
    ).toEqual({
      data: {
        invoiceId: ID,
        reason: "waiver",
        note: "Lift out of service",
        lines: [
          { lineId: "a", taxablePaise: 500000 },
          { lineId: "b", taxablePaise: 0 },
        ],
      },
    });
  });

  it("asks for a reason, a valid amount and at least one amount", () => {
    const r = parseCreditNoteForm([
      ["invoiceId", ID],
      ["reason", ""],
      ["note", ""],
      ["line_a", "abc"],
    ]);
    expect("state" in r && r.state.fieldErrors).toMatchObject({
      reason: "Choose why you're issuing the credit note.",
      line_a: "Enter an amount in rupees, like 5000 or 5000.50.",
    });
    const none = parseCreditNoteForm([
      ["invoiceId", ID],
      ["reason", "correction"],
      ["line_a", "0"],
    ]);
    expect("state" in none && none.state.fieldErrors?.lines).toBe(
      "Enter an amount to credit on at least one line.",
    );
  });
});
