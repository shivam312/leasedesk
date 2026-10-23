// Small helpers for query results.

/** The single row a query produced (e.g. insert … returning()); throws otherwise. */
export function only<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined || rows.length !== 1)
    throw new Error(`Expected one row, got ${rows.length}`);
  return row;
}
