// One report on screen: each section as a table on a laptop and as cards on
// a phone, with its totals. Values are formatted by cellText, the same as
// the PDF, so the screen and the export always read alike.

import {
  cellText,
  isNumeric,
  type Column,
  type Report,
  type ReportRow,
} from "@/lib/reports/report";
import { cn } from "@/lib/utils";

function Head({ column }: { column: Column }) {
  return column.hint ? (
    <abbr title={column.hint} className="underline decoration-dotted">
      {column.label}
    </abbr>
  ) : (
    column.label
  );
}

function Row({
  columns,
  row,
  total,
}: {
  columns: Column[];
  row: ReportRow;
  total?: boolean;
}) {
  return (
    <tr className={cn("border-t align-top", total && "font-semibold")}>
      {columns.map((c) => (
        <td
          key={c.key}
          className={cn(
            "py-2 pr-4 break-words",
            isNumeric(c.kind) && "text-right whitespace-nowrap tabular-nums",
            c.kind === "date" && "whitespace-nowrap",
          )}
        >
          {cellText(c.kind, row[c.key] ?? null)}
        </td>
      ))}
    </tr>
  );
}

function Card({
  columns,
  row,
  total,
}: {
  columns: Column[];
  row: ReportRow;
  total?: boolean;
}) {
  const [first, ...rest] = columns;
  return (
    <li className={cn("rounded-lg border p-4", total && "bg-muted")}>
      <p className="font-medium break-words">
        {total
          ? "Total"
          : first
            ? cellText(first.kind, row[first.key] ?? null)
            : ""}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rest
          .filter(
            (c) =>
              !["", "Total"].includes(cellText(c.kind, row[c.key] ?? null)),
          )
          .map((c) => (
            <div key={c.key} className="contents">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd
                className={cn(
                  "break-words",
                  isNumeric(c.kind) && "text-right tabular-nums",
                )}
              >
                {cellText(c.kind, row[c.key] ?? null)}
              </dd>
            </div>
          ))}
      </dl>
    </li>
  );
}

export function ReportView({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-8">
      {report.sections.map((sec) => (
        <section key={sec.title} className="flex flex-col gap-3">
          {report.sections.length > 1 && (
            <h2 className="text-lg font-semibold">{sec.title}</h2>
          )}
          {sec.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{sec.empty}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      {sec.columns.map((c) => (
                        <th
                          key={c.key}
                          scope="col"
                          className={cn(
                            "py-2 pr-4 align-bottom font-normal",
                            isNumeric(c.kind) && "text-right",
                          )}
                        >
                          <Head column={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((r, i) => (
                      <Row key={i} columns={sec.columns} row={r} />
                    ))}
                  </tbody>
                  {sec.totals && (
                    <tfoot>
                      <Row columns={sec.columns} row={sec.totals} total />
                    </tfoot>
                  )}
                </table>
              </div>
              <ul className="flex flex-col gap-2 md:hidden">
                {sec.rows.map((r, i) => (
                  <Card key={i} columns={sec.columns} row={r} />
                ))}
                {sec.totals && (
                  <Card columns={sec.columns} row={sec.totals} total />
                )}
              </ul>
            </>
          )}
          {sec.rows.length > 0 && sec.columns.some((c) => c.hint) && (
            <dl className="flex max-w-prose flex-col gap-1 text-xs text-muted-foreground">
              {sec.columns
                .filter((c) => c.hint)
                .map((c) => (
                  <div key={c.key}>
                    <dt className="inline font-medium">{c.label}:</dt>{" "}
                    <dd className="inline">{c.hint}</dd>
                  </div>
                ))}
            </dl>
          )}
        </section>
      ))}
      {report.notes && report.notes.length > 0 && (
        <ul className="flex max-w-prose flex-col gap-1 text-xs text-muted-foreground">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
