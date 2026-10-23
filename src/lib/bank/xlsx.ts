// Excel bank statements (.xlsx and old .xls) read with SheetJS into the same
// rows of strings as `parseCsv`, so `statement.ts` reads both alike. Date
// cells become DD-MM-YYYY from their serial number (no Date, no time zone);
// number cells become plain text, whole numbers as they are (cheque numbers),
// others with two decimals (paise), and never rounded to fit: ₹100.005 stays
// "100.005" so the reader refuses it rather than taking ₹100.01. Pure: bytes
// in, rows out.

import { read, SSF, utils, type CellObject, type WorkSheet } from "xlsx";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The number as Excel shows it, to 15 significant digits, so float noise
 * (0.1 + 0.2) is dropped but typed decimals aren't: "3.30", "100.005".
 */
function numberText(v: number): string {
  const shown = Number(v.toPrecision(15));
  if (Number.isInteger(shown)) return String(shown);
  // Shortest form; a tiny 1e-7 keeps its exponent, which no reader accepts.
  const text = String(shown);
  return /\.\d$/.test(text) ? `${text}0` : text;
}

function cellText(cell: CellObject | undefined, date1904: boolean): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z && SSF.is_date(cell.z)) {
      const d = SSF.parse_date_code(cell.v, { date1904 }) as {
        y: number;
        m: number;
        d: number;
      };
      return `${pad(d.d)}-${pad(d.m)}-${d.y}`;
    }
    // A percent cell holds a fraction (5% is 0.05): read it as typed.
    if (cell.z && String(cell.z).includes("%"))
      return `${numberText(cell.v * 100)}%`;
    return numberText(cell.v);
  }
  if (cell.t === "e") return "";
  return String(cell.v).trim();
}

function sheetRows(
  sheet: WorkSheet,
  date1904: boolean,
  keepBlank = false,
): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = utils.decode_range(ref);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = 0; c <= range.e.c; c++)
      row.push(cellText(sheet[utils.encode_cell({ r, c })], date1904));
    if (keepBlank || row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

/**
 * Rows of cells from the workbook's first sheet that has any, trimmed,
 * blank rows left out. Throws if the bytes aren't a spreadsheet.
 */
export function parseSpreadsheet(data: ArrayBuffer | Uint8Array): string[][] {
  const book = read(data, { type: "array", cellNF: true, dense: false });
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  for (const name of book.SheetNames) {
    const rows = sheetRows(book.Sheets[name]!, date1904);
    if (rows.length > 0) return rows;
  }
  return [];
}

/**
 * Every sheet that has rows, by name, read the same way as `parseSpreadsheet`
 * but keeping blank rows (as rows of ""), so a row's index + 1 is its Excel
 * row number when the sheet starts at A1.
 */
export function parseWorkbookSheets(
  data: ArrayBuffer | Uint8Array,
): { name: string; rows: string[][] }[] {
  const book = read(data, { type: "array", cellNF: true, dense: false });
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  return book.SheetNames.map((name) => ({
    name,
    rows: sheetRows(book.Sheets[name]!, date1904, true),
  })).filter((s) => s.rows.some((r) => r.some((c) => c !== "")));
}
