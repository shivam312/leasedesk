import { describe, expect, it } from "vitest";
import { bankAccountSchema, parseImportForm } from "../forms";

const id = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const values = {
    bankAccountId: id,
    fileName: "C:\\fakepath\\nov.csv",
    rows: JSON.stringify([
      ["Date", "Narration", "Deposit"],
      ["01/11/2026", "NEFT", "100"],
    ]),
    date: "Date",
    description: "Narration",
    reference: "",
    credit: "Deposit",
    debit: "",
    amount: "",
    drCr: "",
    ...over,
  };
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

describe("parseImportForm", () => {
  it("reads the rows and the chosen columns", () => {
    expect(parseImportForm(form())).toEqual({
      data: {
        bankAccountId: id,
        fileName: "nov.csv",
        rows: [
          ["Date", "Narration", "Deposit"],
          ["01/11/2026", "NEFT", "100"],
        ],
        mapping: {
          date: "Date",
          description: "Narration",
          reference: null,
          credit: "Deposit",
          debit: null,
          amount: null,
          drCr: null,
        },
      },
    });
  });

  it("refuses rows that aren't a table of text", () => {
    expect(parseImportForm(form({ rows: "{bad" }))).toMatchObject({
      state: { message: "The file couldn't be read." },
    });
    expect(
      parseImportForm(form({ rows: JSON.stringify([[1, 2]]) })),
    ).toMatchObject({ state: { fieldErrors: { rows: expect.any(String) } } });
  });

  it("needs the date and description columns", () => {
    expect(parseImportForm(form({ date: "" }))).toMatchObject({
      state: {
        fieldErrors: { date: "Choose the column with the transaction date." },
      },
    });
  });
});

describe("bankAccountSchema", () => {
  it("needs 4 digits", () => {
    expect(
      bankAccountSchema.safeParse({
        billingEntityId: id,
        bankName: "HDFC Bank",
        accountLast4: "12a4",
      }).success,
    ).toBe(false);
  });
});
