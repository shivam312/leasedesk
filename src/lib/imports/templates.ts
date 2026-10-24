// The Excel templates for the imports: an "How to fill this in" sheet, then
// one sheet per kind of row with just its headings, each heading carrying
// its rule as a cell note. The two example rows per sheet sit on the
// instructions sheet, so they are never imported by mistake. Pure.

import { utils, write } from "xlsx";
import type { ColumnSpec } from "./sheets";

export type TemplateSheet = {
  name: string;
  columns: readonly ColumnSpec[];
  /** One line per column, said on the instructions sheet and as a note on its heading. */
  help: Record<string, string>;
  /** Two sample rows, shown on the instructions sheet. */
  examples: readonly Record<string, string>[];
};

export function templateWorkbook(
  title: string,
  intro: readonly string[],
  sheets: readonly TemplateSheet[],
): Uint8Array {
  const book = utils.book_new();
  const lines: string[][] = [[title], [], ...intro.map((l) => [l]), []];
  for (const sheet of sheets) {
    lines.push(
      [`Sheet "${sheet.name}"`],
      ["Column", "Required", "What to type", "Example"],
    );
    for (const c of sheet.columns)
      lines.push([
        c.heading,
        c.required ? "Yes" : "No",
        sheet.help[c.key] ?? "",
        sheet.examples[0]?.[c.key] ?? "",
      ]);
    lines.push(
      [],
      [
        `Example rows for "${sheet.name}" (type your own rows in that sheet; these aren't imported)`,
      ],
      sheet.columns.map((c) => c.heading),
      ...sheet.examples.map((ex) => sheet.columns.map((c) => ex[c.key] ?? "")),
      [],
    );
  }
  const help = utils.aoa_to_sheet(lines);
  help["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 70 }, { wch: 28 }];
  utils.book_append_sheet(book, help, "How to fill this in");
  for (const sheet of sheets) {
    const ws = utils.aoa_to_sheet([sheet.columns.map((c) => c.heading)]);
    // Each heading's rule as a note, read by hovering over it in Excel.
    sheet.columns.forEach((c, i) => {
      const cell = ws[utils.encode_cell({ r: 0, c: i })];
      const rule = `${c.required ? "Required. " : ""}${sheet.help[c.key] ?? ""}`;
      if (cell && rule.trim()) {
        cell.c = [{ a: "LeaseDesk", t: rule.trim() }];
        cell.c.hidden = true;
      }
    });
    ws["!cols"] = sheet.columns.map((c) => ({
      wch: Math.max(14, c.heading.length + 2),
    }));
    utils.book_append_sheet(book, ws, sheet.name);
  }
  return write(book, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}
