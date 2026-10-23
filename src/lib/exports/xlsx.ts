// A report as an Excel workbook (SheetJS): one sheet per section, with the
// report's title and period on top, the totals row and notes at the bottom.
// Money, area and percent cells are real numbers with Indian number formats,
// so an accountant can add them up; dates are real Excel dates. Pure:
// report in, bytes out.

import { utils, write, type CellObject, type WorkSheet } from "xlsx";
import { toDayNumber } from "@/lib/billing/dates";
import type { Column, Cell, Report, ReportSection } from "@/lib/reports/report";

/** ₹ with lakh and crore grouping: 1,18,000.00 and 1,23,45,678.00. */
export const INR_FORMAT =
  '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00';
const AREA_FORMAT = '#,##0.00" sq ft"';
const PERCENT_FORMAT = "0.00%";
const DATE_FORMAT = "dd-mm-yyyy";

/** Days from Excel's day 0 (30-12-1899) to 01-01-1970. */
const EXCEL_EPOCH_OFFSET = 25569;

/** Whole hundredths (paise, hundredths of a sq ft) as a decimal number. */
function hundredthsToNumber(n: number): number {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return Number(
    `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`,
  );
}

/** A report value as an Excel cell. */
export function excelCell(column: Column, value: Cell): CellObject {
  if (value === null || value === "") return { t: "s", v: "" };
  if (typeof value === "string") {
    if (column.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return {
        t: "n",
        v: toDayNumber(value) + EXCEL_EPOCH_OFFSET,
        z: DATE_FORMAT,
      };
    return { t: "s", v: value };
  }
  switch (column.kind) {
    case "money":
      return { t: "n", v: hundredthsToNumber(value), z: INR_FORMAT };
    case "area":
      return { t: "n", v: hundredthsToNumber(value), z: AREA_FORMAT };
    case "percent":
      // Basis points: 1800 → 0.18, shown as 18.00%.
      return {
        t: "n",
        v: hundredthsToNumber(value) / 100,
        z: PERCENT_FORMAT,
      };
    default:
      return { t: "n", v: value };
  }
}

function sectionSheet(report: Report, section: ReportSection): WorkSheet {
  const text = (v: string): CellObject => ({ t: "s", v });
  const rows: CellObject[][] = [
    [text(`${report.title}: ${section.title}`)],
    [text(report.period)],
    [],
    section.columns.map((c) => text(c.label)),
  ];
  if (section.rows.length === 0) rows.push([text(section.empty)]);
  for (const r of section.rows)
    rows.push(section.columns.map((c) => excelCell(c, r[c.key] ?? null)));
  if (section.totals) {
    const t = section.totals;
    rows.push(section.columns.map((c) => excelCell(c, t[c.key] ?? null)));
  }
  const hints = section.columns.filter((c) => c.hint);
  const notes = [
    ...hints.map((c) => `${c.label}: ${c.hint}`),
    ...(report.notes ?? []),
  ];
  if (notes.length > 0) {
    rows.push([]);
    for (const n of notes) rows.push([text(n)]);
  }
  const sheet = utils.aoa_to_sheet(rows);
  sheet["!cols"] = section.columns.map((c) => ({
    wch: Math.max(
      c.label.length,
      c.kind === "text" ? 24 : c.kind === "date" ? 12 : 16,
    ),
  }));
  return sheet;
}

/** A sheet name Excel accepts: at most 31 characters, none of : \ / ? * [ ]. */
export function sheetName(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .replace(/[:\\/?*[\]]/g, " ")
      .slice(0, 31)
      .trim() || "Sheet";
  let name = base;
  for (let n = 2; taken.has(name); n++)
    name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  return name;
}

export function reportWorkbook(report: Report): Uint8Array {
  const book = utils.book_new();
  const taken = new Set<string>();
  for (const section of report.sections) {
    const name = sheetName(
      report.sections.length > 1 ? section.title : report.title,
      taken,
    );
    taken.add(name);
    utils.book_append_sheet(book, sectionSheet(report, section), name);
  }
  return write(book, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}
