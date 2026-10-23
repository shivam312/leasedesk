import { describe, expect, it } from "vitest";
import { utils, write, type CellObject } from "xlsx";
import { readStatement, suggestMapping } from "../statement";
import { parseSpreadsheet } from "../xlsx";

// Excel serials: 46327 is 01-11-2026, 46336 is 10-11-2026.
const date = (v: number, z = "dd/mm/yyyy"): CellObject => ({ t: "n", v, z });
const num = (v: number, z = "#,##0.00"): CellObject => ({ t: "n", v, z });

function book(rows: unknown[][], bookType: "xlsx" | "biff8" = "xlsx") {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), "Statement");
  return new Uint8Array(write(wb, { type: "array", bookType }));
}

// An HDFC-style export: title lines above the table, a footer below.
const hdfc = [
  ["HDFC BANK Ltd. Statement of account"],
  [],
  [
    "Date",
    "Narration",
    "Chq./Ref.No.",
    "Value Dt",
    "Withdrawal Amt.",
    "Deposit Amt.",
    "Closing Balance",
  ],
  [
    date(46327),
    "NEFT CR-ACME SOFTWARE PVT LTD-INV T/26-27/0001",
    "N305263012345678",
    date(46327),
    null,
    num(126360),
    num(526360),
  ],
  [
    date(46336, "d-mmm-yy"),
    "ELECTRICITY BILL MSEDCL",
    num(123, "0"),
    date(46336),
    num(12500.5),
    null,
    num(513859.5),
  ],
  ["**Statement Summary**"],
];

describe("parseSpreadsheet", () => {
  it("reads date cells day first and amounts as plain text, skipping blank rows", () => {
    const rows = parseSpreadsheet(book(hdfc));
    expect(rows[0]).toEqual([
      "HDFC BANK Ltd. Statement of account",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(rows[2]).toEqual([
      "01-11-2026",
      "NEFT CR-ACME SOFTWARE PVT LTD-INV T/26-27/0001",
      "N305263012345678",
      "01-11-2026",
      "",
      "126360",
      "526360",
    ]);
    expect(rows[3]).toEqual([
      "10-11-2026",
      "ELECTRICITY BILL MSEDCL",
      "123",
      "10-11-2026",
      "12500.50",
      "",
      "513859.50",
    ]);
    expect(rows).toHaveLength(5);
  });

  it("rounds a float amount to paise without drifting", () => {
    const rows = parseSpreadsheet(book([[num(0.1 + 0.2)], [num(-45000.5)]]));
    expect(rows).toEqual([["0.30"], ["-45000.50"]]);
  });

  it("reads an old .xls file the same way", () => {
    expect(parseSpreadsheet(book(hdfc, "biff8"))).toEqual(
      parseSpreadsheet(book(hdfc)),
    );
  });

  it("gives rows the statement reader imports as credits", () => {
    const rows = parseSpreadsheet(book(hdfc));
    const suggested = suggestMapping(rows);
    expect(suggested?.mapping).toMatchObject({
      date: "Date",
      description: "Narration",
      credit: "Deposit Amt.",
    });
    const read = readStatement(rows, suggested!.mapping);
    expect(read).toMatchObject({
      lines: [
        {
          date: "2026-11-01",
          creditPaise: 12636000,
          reference: "N305263012345678",
        },
      ],
    });
  });

  it("returns no rows for an empty workbook", () => {
    expect(parseSpreadsheet(book([]))).toEqual([]);
  });
});
