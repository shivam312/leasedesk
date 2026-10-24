import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { getImport } from "@/lib/bank/imports";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";

export const metadata: Metadata = { title: "Bank statement" };

const STATUS = {
  unmatched: { label: "Not matched yet", tone: "warn" },
  suggested: { label: "Match suggested", tone: "neutral" },
  matched: { label: "Recorded as payment", tone: "good" },
  ignored: { label: "Not rent", tone: "neutral" },
} as const;

export default function ImportPage({
  params,
}: PageProps<"/billing/bank/imports/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the statement…</p>
      }
    >
      <Import params={params} />
    </Suspense>
  );
}

async function Import({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, (s) => getImport(s, id));
  if (!data) notFound();
  const { import: imp, lines } = data;
  const skipped = [
    imp.duplicateCount > 0 &&
      `${imp.duplicateCount} already imported from an earlier statement`,
    imp.debitCount > 0 &&
      `${imp.debitCount} ${imp.debitCount === 1 ? "line" : "lines"} of money paid out`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/billing/bank"
          className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
        >
          ← Import bank statement
        </Link>
        <PageHeader
          title={
            imp.periodStart && imp.periodEnd
              ? `Statement, ${formatDate(imp.periodStart)} to ${formatDate(imp.periodEnd)}`
              : "Statement"
          }
          description={`${data.bankName} account ending ${data.accountLast4}, from ${imp.fileName}.`}
        />
      </div>
      <p className="max-w-2xl text-sm">
        Read {imp.lineCount} {imp.lineCount === 1 ? "payment" : "payments"} into
        your account from the statement.
        {skipped.length > 0 && ` Left out: ${skipped.join(", ")}.`}
      </p>
      {lines.some(
        (l) => l.matchStatus === "unmatched" || l.matchStatus === "suggested",
      ) && (
        <Link
          href="/billing/bank/match"
          className={buttonVariants({ className: "h-11 self-start md:h-9" })}
        >
          Match payments
        </Link>
      )}
      {lines.length === 0 ? (
        <p className="max-w-2xl text-sm">
          Nothing new in this statement.{" "}
          <Link href="/billing/bank" className="underline">
            Import another statement
          </Link>
          .
        </p>
      ) : (
        <ul className="flex max-w-3xl flex-col text-sm">
          {lines.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-1 border-b py-3 md:flex-row md:items-center md:justify-between md:gap-4"
            >
              <span className="min-w-0 break-words">
                <span className="tabular-nums">{formatDate(l.date)}</span> ·{" "}
                {l.description}
                {l.reference && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {l.reference}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {formatINR(l.creditAmount)}
                </span>
                <Badge tone={STATUS[l.matchStatus].tone}>
                  {STATUS[l.matchStatus].label}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
