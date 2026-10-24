import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { read, utils } from "xlsx";
import { allDataZip, README } from "../all-data";

describe("allDataZip", () => {
  it("has a Read me, an Excel file per table with snake_case columns, and the files", () => {
    const zip = unzipSync(
      allDataZip(
        [
          {
            name: "invoices",
            rows: [
              {
                id: "i1",
                grandTotal: 13_806_000,
                invoiceDate: "2026-11-01",
                sentAt: new Date("2026-11-01T04:30:00Z"),
              },
            ],
          },
          { name: "deposits", rows: [] },
        ],
        [{ path: "invoices/i1.pdf", bytes: new Uint8Array([37, 80, 68, 70]) }],
      ),
    );
    expect(Object.keys(zip).sort()).toEqual(
      [
        "Read me.txt",
        "deposits.xlsx",
        "files/invoices/i1.pdf",
        "invoices.xlsx",
      ].sort(),
    );
    expect(strFromU8(zip["Read me.txt"]!)).toBe(README);
    const sheet = read(zip["invoices.xlsx"]!).Sheets.invoices!;
    // Paise as stored: ₹1,38,060 is 13806000.
    expect(utils.sheet_to_json(sheet)).toEqual([
      {
        id: "i1",
        grand_total: 13_806_000,
        invoice_date: "2026-11-01",
        sent_at: "2026-11-01T04:30:00.000Z",
      },
    ]);
    expect([...zip["files/invoices/i1.pdf"]!]).toEqual([37, 80, 68, 70]);
  });
});
