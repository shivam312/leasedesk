# Synthetic bank statements

Made-up statements in the column layouts of HDFC, SBI and Axis Bank exports, written by hand for the importer's tests (`src/lib/bank/__tests__/statement.test.ts`). `hdfc-like.xlsx` is the same statement as `hdfc-like.csv` as an Excel file, with real date and number cells (`tests/e2e/bank.spec.ts`). They contain no real data. Real exports from pilots, with personal details removed, go in `tests/fixtures/bank/` (Human task in `docs/DECISIONS_NEEDED.md`).
