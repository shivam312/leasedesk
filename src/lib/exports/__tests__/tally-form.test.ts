import { describe, expect, it } from "vitest";
import { LEDGER_FIELDS, partyField, readLedgerForm } from "../tally-form";

const filled = () => {
  const form = new FormData();
  for (const [key] of LEDGER_FIELDS) form.set(key, ` ${key} ledger `);
  return form;
};

describe("readLedgerForm", () => {
  it("reads every ledger name, trimmed, and each tenant's party ledger", () => {
    const form = filled();
    form.set(partyField("t1"), " Acme (Debtors) ");
    form.set(partyField("t2"), "");
    const read = readLedgerForm(form, ["t1", "t2"]);
    if ("errors" in read) throw new Error("expected values");
    expect(read.organization["tally.ledgerRent"]).toBe(
      "tally.ledgerRent ledger",
    );
    expect(read.parties).toEqual(
      new Map([
        ["t1", "Acme (Debtors)"],
        ["t2", ""],
      ]),
    );
  });

  it("refuses a blank ledger name or one over 100 characters", () => {
    const form = filled();
    form.set("tally.ledgerCgst", "  ");
    form.set(partyField("t1"), "x".repeat(101));
    const read = readLedgerForm(form, ["t1"]);
    expect("errors" in read && read.errors).toEqual({
      "tally.ledgerCgst":
        "Type the CGST ledger's name as it is in Tally (up to 100 characters).",
      [partyField("t1")]: "Up to 100 characters.",
    });
  });
});
