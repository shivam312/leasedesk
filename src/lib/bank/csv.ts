// A small CSV reader for bank statement exports (RFC 4180 quoting), so the
// import works without a parsing library. Handles a byte-order mark, CRLF,
// LF or CR line ends, quoted fields with commas, quotes ("") and line
// breaks, and comma, semicolon, tab or pipe separators (detected from the
// first lines). Pure: text in, rows of strings out.

const SEPARATORS = [",", ";", "\t", "|"] as const;

/** The separator used most consistently in the first lines, outside quotes. */
export function detectSeparator(text: string): string {
  const lines = text
    .split(/\r\n|\n|\r/)
    .slice(0, 30)
    .filter((l) => l.trim());
  let best: string = ",";
  let bestScore = -1;
  for (const sep of SEPARATORS) {
    const counts = lines.map((line) => {
      let n = 0;
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === sep && !quoted) n++;
      }
      return n;
    });
    // Lines with the most common non-zero count: a table's rows agree.
    const freq = new Map<number, number>();
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    const score = Math.max(0, ...freq.values());
    if (score > bestScore) {
      best = sep;
      bestScore = score;
    }
  }
  return best;
}

/** Rows of cells, trimmed; blank rows left out. */
export function parseCsv(input: string, separator?: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = separator ?? detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (ch === sep) endCell();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") endRow();
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}
