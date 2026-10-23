"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";
import { parseCsv } from "@/lib/bank/csv";
import {
  findHeaderRow,
  mappingProblem,
  readStatement,
  suggestMapping,
  type ColumnMapping,
} from "@/lib/bank/statement";
import { formatDate, formatINR } from "@/lib/format";

export type ImportAccount = {
  id: string;
  label: string;
  columnMapping: ColumnMapping | null;
};

const EMPTY: ColumnMapping = {
  date: "",
  description: "",
  reference: null,
  credit: null,
  debit: null,
  amount: null,
  drCr: null,
};

/** Shown under "More options" while money received has a column. */
const advancedKeys: (keyof ColumnMapping)[] = [
  "reference",
  "debit",
  "amount",
  "drCr",
];

const FIELDS: {
  key: keyof ColumnMapping;
  label: string;
  optional?: boolean;
}[] = [
  { key: "date", label: "Transaction date" },
  { key: "description", label: "Description (narration)" },
  {
    key: "reference",
    label: "Reference (UTR or cheque number)",
    optional: true,
  },
  {
    key: "credit",
    label: "Money received (credit or deposit)",
    optional: true,
  },
  {
    key: "debit",
    label: "Money paid out (debit or withdrawal)",
    optional: true,
  },
  {
    key: "amount",
    label: "Amount, if there's one column for both",
    optional: true,
  },
  { key: "drCr", label: "Dr/Cr column, beside that amount", optional: true },
];

/**
 * Import a bank statement: pick the account and the file, check which
 * column is which (remembered after the first import), see what will be
 * imported, then import. The file is read here; the server reads the rows
 * again before saving.
 */
export function StatementImport({
  accounts,
  action,
}: {
  accounts: ImportAccount[];
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const base = useId();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY);
  const [headers, setHeaders] = useState<string[]>([]);
  const [usingSaved, setUsingSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const account = accounts.find((a) => a.id === accountId);

  function prepare(next: string[][], forAccount = account) {
    const saved = forAccount?.columnMapping ?? null;
    const savedRow = saved ? findHeaderRow(next, saved) : null;
    if (saved && savedRow !== null) {
      setMapping(saved);
      setHeaders(next[savedRow]!);
      setUsingSaved(true);
      setEditing(false);
      return;
    }
    const suggested = suggestMapping(next);
    setUsingSaved(false);
    setEditing(true);
    if (suggested) {
      setMapping(suggested.mapping);
      setHeaders(suggested.headers);
    } else {
      setMapping(EMPTY);
      setHeaders(next.find((r) => r.filter(Boolean).length >= 3) ?? []);
    }
  }

  async function onFile(file: File | undefined) {
    setRows(null);
    setFileError(null);
    if (!file) return;
    setFileName(file.name);
    let next: string[][];
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      try {
        const { parseSpreadsheet } = await import("@/lib/bank/xlsx");
        next = parseSpreadsheet(await file.arrayBuffer());
      } catch {
        setFileError(
          "This Excel file can't be read. Open it in Excel, choose File → Save As → CSV, then choose that file here.",
        );
        return;
      }
    } else next = parseCsv(await file.text());
    if (next.length === 0) {
      setFileError(
        "That file is empty. Download the statement again from net banking and choose it here.",
      );
      return;
    }
    setRows(next);
    prepare(next);
  }

  const problem = rows ? mappingProblem(mapping) : null;
  const preview = rows && !problem ? readStatement(rows, mapping) : null;
  const json = rows ? JSON.stringify(rows) : "";
  const tooBig = json.length > 3_500_000;
  const count = preview && "lines" in preview ? preview.lines.length : 0;
  const options = headers.filter(Boolean);

  const select = (f: (typeof FIELDS)[number]) => (
    <Field
      key={f.key}
      label={f.optional ? `${f.label} (optional)` : f.label}
      htmlFor={`${base}-${f.key}`}
    >
      <Select
        id={`${base}-${f.key}`}
        value={mapping[f.key] ?? ""}
        onChange={(e) =>
          setMapping({
            ...mapping,
            [f.key]: e.target.value || (f.optional ? null : ""),
          })
        }
      >
        <option value="">{f.optional ? "None" : "Choose a column"}</option>
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <Field label="Bank account" htmlFor={`${base}-account`}>
        <Select
          id={`${base}-account`}
          name="bankAccountId"
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            const next = accounts.find((a) => a.id === e.target.value);
            if (rows) prepare(rows, next);
          }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Statement file"
        htmlFor={`${base}-file`}
        hint="Download it from net banking as Excel or CSV."
        error={fileError ?? undefined}
      >
        <Input
          id={`${base}-file`}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </Field>
      <input type="hidden" name="fileName" value={fileName} />
      <input type="hidden" name="rows" value={json} />
      {(Object.keys(EMPTY) as (keyof ColumnMapping)[]).map((k) => (
        <input key={k} type="hidden" name={k} value={mapping[k] ?? ""} />
      ))}

      {rows && usingSaved && !editing && (
        <p className="text-sm">
          Using this account&apos;s saved columns: {mapping.date},{" "}
          {mapping.description}, {mapping.credit ?? mapping.amount}.{" "}
          <button
            type="button"
            className="min-h-11 underline md:min-h-0"
            onClick={() => setEditing(true)}
          >
            Change columns
          </button>
        </p>
      )}

      {rows && editing && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 font-medium">Which column is which?</legend>
          <p className="text-sm text-muted-foreground">
            {options.length === 0
              ? "We couldn't find the column names in this file. Check it's a statement export."
              : "We've guessed from the column names. Check them once; they're saved for this account."}
          </p>
          {FIELDS.filter((f) => !advancedKeys.includes(f.key)).map(select)}
          <details open={!mapping.credit}>
            <summary className="min-h-11 cursor-pointer text-sm underline md:min-h-0">
              More options
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              {FIELDS.filter((f) => advancedKeys.includes(f.key)).map(select)}
            </div>
          </details>
        </fieldset>
      )}

      {rows && (
        <section aria-live="polite" className="flex flex-col gap-2 text-sm">
          {problem && <p className="text-destructive">{problem}</p>}
          {preview && "error" in preview && (
            <p className="text-destructive">{preview.error}</p>
          )}
          {preview && "lines" in preview && (
            <>
              <p>
                {count === 0
                  ? "No money received in this file."
                  : `${count} ${count === 1 ? "payment" : "payments"} received from ${formatDate(preview.periodStart!)} to ${formatDate(preview.periodEnd!)}, ${formatINR(preview.lines.reduce((s, l) => s + l.creditPaise, 0))} in all.`}{" "}
                {preview.debits > 0 &&
                  `${preview.debits} lines of money paid out are left out.`}{" "}
                Lines already imported from an earlier statement are skipped.
              </p>
              {preview.lines.length > 0 && (
                <ul className="flex flex-col">
                  {preview.lines.slice(0, 5).map((l) => (
                    <li
                      key={l.fingerprint}
                      className="flex flex-wrap justify-between gap-x-4 border-b py-2"
                    >
                      <span className="min-w-0 break-words">
                        {formatDate(l.date)} · {l.description}
                      </span>
                      <span className="tabular-nums">
                        {formatINR(l.creditPaise)}
                      </span>
                    </li>
                  ))}
                  {preview.lines.length > 5 && (
                    <li className="py-2 text-muted-foreground">
                      and {preview.lines.length - 5} more
                    </li>
                  )}
                </ul>
              )}
              {preview.problems.length > 0 && (
                <ul className="list-disc pl-5 text-destructive">
                  {preview.problems.slice(0, 10).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {tooBig && (
            <p className="text-destructive">
              This file is too big to import at once. Download one month at a
              time.
            </p>
          )}
        </section>
      )}

      <FormMessage message={state.message} tone={state.tone} />
      <div>
        <Button
          type="submit"
          disabled={pending || !rows || count === 0 || tooBig}
          className="h-11 md:h-9"
        >
          {pending
            ? "Importing…"
            : count > 0
              ? `Import ${count} ${count === 1 ? "payment" : "payments"} received`
              : "Import statement"}
        </Button>
      </div>
    </form>
  );
}
