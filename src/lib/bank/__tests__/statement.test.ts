import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectSeparator, parseCsv } from "../csv";
import {
  findHeaderRow,
  mappingProblem,
  parseBankAmount,
  parseBankDate,
  readStatement,
  suggestMapping,
  type ColumnMapping,
} from "../statement";

// Made-up statements in the layouts of real Indian bank exports. Real
// exports (personal details removed) go in tests/fixtures/bank/ (Human task).
const fixture = (name: string) =>
  readFileSync(
    join(process.cwd(), "tests/fixtures/bank/synthetic", name),
    "utf8",
  );

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes and line breaks", () => {
    expect(
      parseCsv('a,"b, c","say ""hi""","two\nlines"\r\n1,2,3,4\r\n'),
    ).toEqual([
      ["a", "b, c", 'say "hi"', "two\nlines"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("drops a byte-order mark and blank rows", () => {
    expect(parseCsv("﻿x,y\n\n,\n1,2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });

  it("detects tab, semicolon and pipe separators", () => {
    expect(detectSeparator("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectSeparator("a;b;c\n1;2,5;3")).toBe(";");
    expect(detectSeparator("a|b|c\n1|2|3")).toBe("|");
    expect(detectSeparator('a,b,c\n"1,0",2,3')).toBe(",");
  });
});

describe("parseBankDate", () => {
  it.each([
    ["01/11/26", "2026-11-01"],
    ["01/11/2026", "2026-11-01"],
    ["1-11-2026", "2026-11-01"],
    ["01.11.2026", "2026-11-01"],
    ["1 Nov 2026", "2026-11-01"],
    ["01-Nov-2026", "2026-11-01"],
    ["01-NOV-26", "2026-11-01"],
    ["1 Sept 2026", "2026-09-01"],
    ["2026-11-01", "2026-11-01"],
    ["01/11/2026 10:22:01", "2026-11-01"],
  ])("reads %s day first", (text, date) => {
    expect(parseBankDate(text)).toBe(date);
  });

  it.each(["", "31/02/2026", "13/13/2026", "Opening balance", "11/2026"])(
    "refuses %j",
    (text) => {
      expect(parseBankDate(text)).toBeNull();
    },
  );
});

describe("parseBankAmount", () => {
  it.each([
    ["1,18,000.00", 11_800_000, null],
    ["118000", 11_800_000, null],
    ["₹ 500.5", 50_050, null],
    ["INR 1,000", 100_000, null],
    ["2,000.00 Cr", 200_000, "cr"],
    ["2,000.00Dr", 200_000, "dr"],
    ["(500.00)", 50_000, null],
    ["-500", 50_000, null],
    ["118000.000", 11_800_000, null],
    ["", 0, null],
    ["-", 0, null],
  ])("reads %j", (text, paise, side) => {
    expect(parseBankAmount(text)).toEqual({ paise, side });
  });

  it.each(["abc", "1.234", "12,34.5x"])("refuses %j", (text) => {
    expect(parseBankAmount(text)).toBeNull();
  });
});

describe("suggestMapping", () => {
  it("finds the HDFC-style header below the preamble", () => {
    const rows = parseCsv(fixture("hdfc-like.csv"));
    expect(suggestMapping(rows)).toEqual({
      headerRow: 1,
      headers: rows[1],
      mapping: {
        date: "Date",
        description: "Narration",
        reference: "Chq./Ref.No.",
        credit: "Deposit Amt.",
        debit: "Withdrawal Amt.",
        amount: null,
        drCr: null,
      },
    });
  });

  it("prefers the transaction date to the value date (SBI-style)", () => {
    const rows = parseCsv(fixture("sbi-like.tsv"));
    expect(suggestMapping(rows)?.mapping).toEqual({
      date: "Txn Date",
      description: "Description",
      reference: "Ref No./Cheque No.",
      credit: "Credit",
      debit: "Debit",
      amount: null,
      drCr: null,
    });
  });

  it("uses an amount and Dr/Cr column when there's no credit column (Axis-style)", () => {
    const rows = parseCsv(fixture("axis-like.csv"));
    expect(suggestMapping(rows)?.mapping).toEqual({
      date: "Tran Date",
      description: "PARTICULARS",
      reference: "CHQNO",
      credit: null,
      debit: null,
      amount: "Amount",
      drCr: "Dr / Cr",
    });
  });

  it("is null when nothing looks like a statement", () => {
    expect(
      suggestMapping([
        ["Name", "Phone"],
        ["A", "1"],
      ]),
    ).toBeNull();
  });
});

describe("readStatement", () => {
  it("keeps credits, counts debits, and numbers repeated lines", () => {
    const rows = parseCsv(fixture("hdfc-like.csv"));
    const result = readStatement(rows, suggestMapping(rows)!.mapping);
    expect(result).toEqual({
      lines: [
        {
          row: 3,
          date: "2026-11-01",
          description:
            "NEFT CR-HDFC0000001-ACME SOFTWARE PVT LTD-INV T/26-27/0001",
          reference: "N305263012345678",
          creditPaise: 12_636_000,
          fingerprint:
            "2026-11-01|12636000|neft cr-hdfc0000001-acme software pvt ltd-inv t/26-27/0001|N305263012345678#1",
        },
        expect.objectContaining({
          row: 5,
          creditPaise: 4_500_000,
          fingerprint: expect.stringMatching(/#1$/),
        }),
        expect.objectContaining({
          row: 6,
          creditPaise: 4_500_000,
          fingerprint: expect.stringMatching(/#2$/),
        }),
      ],
      debits: 1,
      problems: [],
      periodStart: "2026-11-01",
      periodEnd: "2026-11-05",
    });
  });

  it("reads an amount with a Dr/Cr column", () => {
    const rows = parseCsv(fixture("axis-like.csv"));
    const result = readStatement(rows, suggestMapping(rows)!.mapping);
    expect("lines" in result && result.lines.map((l) => l.creditPaise)).toEqual(
      [5_900_000, 23_600_000],
    );
    expect("debits" in result && result.debits).toBe(1);
  });

  it("finds the saved columns even when the preamble is longer", () => {
    const rows = parseCsv(fixture("sbi-like.tsv"));
    const mapping = suggestMapping(rows)!.mapping;
    const longer = [["Branch: Andheri"], ["Period: Nov 2026"], ...rows];
    expect(findHeaderRow(longer, mapping)).toBe(4);
    const result = readStatement(longer, mapping);
    // The ₹0.00 interest row is neither a credit nor a debit
    expect("lines" in result && result.lines).toHaveLength(1);
    expect("debits" in result && result.debits).toBe(1);
  });

  it("reports a credit whose date or amount can't be read", () => {
    const mapping: ColumnMapping = {
      date: "Date",
      description: "Narration",
      reference: null,
      credit: "Credit",
      debit: null,
      amount: null,
      drCr: null,
    };
    const result = readStatement(
      [
        ["Date", "Narration", "Credit"],
        ["32/11/2026", "NEFT", "1,000"],
        ["01/11/2026", "NEFT", "ten"],
        ["Closing balance", "", ""],
      ],
      mapping,
    );
    expect(result).toMatchObject({
      lines: [],
      problems: [
        "Row 2: couldn't read the date “32/11/2026”, so this credit was left out.",
        "Row 3: couldn't read the amount “ten”, so this row was left out.",
      ],
    });
  });

  it("says when the saved columns aren't in the file", () => {
    const rows = parseCsv(fixture("axis-like.csv"));
    const hdfc = suggestMapping(parseCsv(fixture("hdfc-like.csv")))!.mapping;
    expect(readStatement(rows, hdfc)).toEqual({
      error:
        "This file has no row with the columns “Date” and “Narration”. Check it's a statement of this account, or set the columns again.",
    });
  });
});

describe("mappingProblem", () => {
  it("needs a date, a description and money received", () => {
    const base: ColumnMapping = {
      date: "Date",
      description: "Narration",
      reference: null,
      credit: "Deposit",
      debit: null,
      amount: null,
      drCr: null,
    };
    expect(mappingProblem(base)).toBeNull();
    expect(mappingProblem({ ...base, credit: null })).toMatch(/money received/);
    expect(
      mappingProblem({ ...base, credit: null, amount: "Amount", drCr: "Type" }),
    ).toBeNull();
    expect(mappingProblem({ ...base, date: "" })).toMatch(/date/);
  });
});
