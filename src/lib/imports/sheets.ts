// Shared pieces of the Excel imports: finding a sheet and its columns by
// their headings, and the row-by-row error list. Pure.

export type Sheet = { name: string; rows: string[][] };

/** A problem with one row: its sheet and its row number as Excel shows it. */
export type RowError = { sheet: string; row: number; message: string };

export type ColumnSpec<K extends string = string> = {
  key: K;
  /** The heading in the template; matched without case or spaces. */
  heading: string;
  required?: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function findSheet(
  sheets: readonly Sheet[],
  name: string,
): Sheet | undefined {
  return sheets.find((s) => norm(s.name) === norm(name));
}

/**
 * The sheet's rows as records by column key, with each row's Excel row
 * number. The first row must be the headings; a missing required heading is
 * one error for the sheet.
 */
export function readRows<K extends string>(
  sheet: Sheet,
  columns: readonly ColumnSpec<K>[],
):
  { rows: { row: number; values: Record<K, string> }[] } | { error: RowError } {
  const [head, ...body] = sheet.rows;
  const headings = (head ?? []).map(norm);
  const index = new Map<string, number>();
  for (const c of columns) {
    const at = headings.indexOf(norm(c.heading));
    if (at >= 0) index.set(c.key, at);
    else if (c.required)
      return {
        error: {
          sheet: sheet.name,
          row: 1,
          message: `The "${c.heading}" column is missing. Download the template and copy your rows into it.`,
        },
      };
  }
  return {
    rows: body
      .map((cells, i) => ({ cells, row: i + 2 }))
      .filter(({ cells }) => cells.some((c) => c.trim() !== ""))
      .map(({ cells, row }) => ({
        row,
        values: Object.fromEntries(
          columns.map((c) => {
            const at = index.get(c.key);
            return [c.key, at === undefined ? "" : (cells[at] ?? "").trim()];
          }),
        ) as Record<K, string>,
      })),
  };
}

/** "Row 7: …" lines, in sheet then row order. */
export function sortErrors(errors: RowError[]): RowError[] {
  return [...errors].sort(
    (a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row,
  );
}
