import { read, utils } from "xlsx";
import { describe, expect, it } from "vitest";
import type { Report } from "@/lib/reports/report";
import { excelCell, reportWorkbook, sheetName } from "../xlsx";

const report: Report = {
  slug: "rent-roll",
  title: "Rent roll",
  period: "As on 23-10-2026",
  sections: [
    {
      title: "Leases",
      empty: "No lease is running on this date.",
      columns: [
        { key: "tenant", label: "Tenant", kind: "text" },
        {
          key: "area",
          label: "Billed area",
          kind: "area",
          hint: "The area rent is billed on",
        },
        { key: "rent", label: "Rent per month", kind: "money" },
        { key: "end", label: "Lease ends", kind: "date" },
      ],
      rows: [
        {
          tenant: "Acme Software Pvt Ltd",
          area: 125_050,
          rent: 10_691_775,
          end: "2030-03-31",
        },
      ],
      totals: { tenant: "Total", area: 125_050, rent: 10_691_775 },
    },
  ],
  notes: ["Amounts are before GST."],
};

describe("excelCell", () => {
  const col = (kind: "money" | "area" | "percent" | "date" | "count") => ({
    key: "x",
    label: "X",
    kind,
  });
  it("writes paise as rupees, exactly to the paisa", () => {
    expect(excelCell(col("money"), 10_691_775)).toMatchObject({
      t: "n",
      v: 106917.75,
    });
    expect(excelCell(col("money"), -5)).toMatchObject({ v: -0.05 });
    expect(excelCell(col("money"), 1_234_567_800)).toMatchObject({
      v: 12345678,
    });
  });
  it("writes dates as Excel serial numbers with a DD-MM-YYYY format", () => {
    // 01-01-1970 is day 25569; 23-10-2026 is 20749 days later = 46318
    expect(excelCell(col("date"), "1970-01-01")).toMatchObject({ v: 25569 });
    expect(excelCell(col("date"), "2026-10-23")).toMatchObject({
      v: 46318,
      z: "dd-mm-yyyy",
    });
  });
  it("writes basis points as a fraction shown as a percent", () => {
    expect(excelCell(col("percent"), 1800)).toMatchObject({
      v: 0.18,
      z: "0.00%",
    });
  });
  it("leaves empty cells blank and keeps labels in number columns", () => {
    expect(excelCell(col("money"), null)).toEqual({ t: "s", v: "" });
    expect(excelCell(col("date"), "Total")).toEqual({ t: "s", v: "Total" });
  });
});

describe("sheetName", () => {
  it("drops characters Excel refuses, cuts to 31 and keeps names unique", () => {
    expect(sheetName("Q1/Q2: [draft]?", new Set())).toBe("Q1 Q2   draft");
    const long = "Unpaid invoices for every tenant this year";
    expect(sheetName(long, new Set())).toHaveLength(31);
    expect(sheetName("By tenant", new Set(["By tenant"]))).toBe("By tenant 2");
  });
});

describe("reportWorkbook", () => {
  it("reads back with the title, header, rows, totals and notes", () => {
    const book = read(reportWorkbook(report));
    expect(book.SheetNames).toEqual(["Rent roll"]);
    const rows = utils.sheet_to_json<unknown[]>(book.Sheets["Rent roll"]!, {
      header: 1,
      raw: true,
      blankrows: true,
    });
    expect(rows[0]).toEqual(["Rent roll: Leases"]);
    expect(rows[1]).toEqual(["As on 23-10-2026"]);
    expect(rows[3]).toEqual([
      "Tenant",
      "Billed area",
      "Rent per month",
      "Lease ends",
    ]);
    // 31-03-2030: 22004 days after 01-01-1970, + 25569 = 47573
    expect(rows[4]).toEqual([
      "Acme Software Pvt Ltd",
      1250.5,
      106917.75,
      47573,
    ]);
    expect(rows[5]).toEqual(["Total", 1250.5, 106917.75, ""]);
    expect(rows.slice(7).map((r) => r[0])).toEqual([
      "Billed area: The area rent is billed on",
      "Amounts are before GST.",
    ]);
  });

  it("one sheet per section, and says so when a section is empty", () => {
    const book = read(
      reportWorkbook({
        ...report,
        sections: [
          { ...report.sections[0]!, title: "By building" },
          {
            ...report.sections[0]!,
            title: "Vacant units",
            rows: [],
            totals: undefined,
          },
        ],
      }),
    );
    expect(book.SheetNames).toEqual(["By building", "Vacant units"]);
    const rows = utils.sheet_to_json<unknown[]>(book.Sheets["Vacant units"]!, {
      header: 1,
      blankrows: true,
    });
    expect(rows[4]).toEqual(["No lease is running on this date."]);
  });
});
