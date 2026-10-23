// Small helpers for query results.

/** The single row a query produced (e.g. insert … returning()); throws otherwise. */
export function only<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined || rows.length !== 1)
    throw new Error(`Expected one row, got ${rows.length}`);
  return row;
}

/**
 * A SQL sum of a paise column, for `sum(col).mapWith(paiseSum)`. Postgres
 * returns it as a `numeric` string; refuse one a number can't hold exactly
 * rather than show a rounded amount (CLAUDE.md rule 1).
 */
export function paiseSum(value: unknown): number {
  const text = String(value);
  if (!/^-?\d+$/.test(text))
    throw new RangeError(`Expected a whole number of paise, got "${text}"`);
  const n = BigInt(text);
  if (
    n > BigInt(Number.MAX_SAFE_INTEGER) ||
    n < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new RangeError(`Amount ${text} paise is beyond the safe range`);
  return Number(n);
}
