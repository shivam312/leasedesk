import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceStatusBadge } from "@/components/invoices/StatusBadge";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import type { LedgerEntry } from "@/lib/billing/ledger";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";
import { ledgerFor } from "@/lib/payments/ledger";
import { getTenant } from "@/lib/tenants/queries";
import { todayInIndia } from "@/lib/today";

export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage({
  params,
}: PageProps<"/tenants/[id]/ledger">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the ledger…</p>
      }
    >
      <TenantLedger params={params} />
    </Suspense>
  );
}

/** "₹1,11,700 due", "₹73,740 in credit" or "Nothing due". */
function balanceWords(paise: number) {
  if (paise > 0) return `${formatINR(paise)} due`;
  if (paise < 0) return `${formatINR(-paise)} in credit`;
  return "Nothing due";
}

/** Where an entry's row comes from, to open it. */
function hrefOf(e: LedgerEntry) {
  switch (e.kind) {
    case "invoice":
      return `/billing/invoices/${e.sourceId}`;
    case "credit_note":
      return `/billing/credit-notes/${e.sourceId}/pdf`;
    default:
      return `/billing/payments/${e.sourceId}`;
  }
}

type InvoiceStatuses = Awaited<ReturnType<typeof ledgerFor>>["invoiceStatus"];

/** An invoice row's status, e.g. "Overdue", beside its label. */
function Status({
  e,
  statuses,
  today,
}: {
  e: LedgerEntry;
  statuses: InvoiceStatuses;
  today: string;
}) {
  const invoice = e.kind === "invoice" ? statuses.get(e.sourceId) : undefined;
  return invoice ? (
    <span className="ml-2 inline-block">
      <InvoiceStatusBadge invoice={invoice} today={today} />
    </span>
  ) : null;
}

function What({ e }: { e: LedgerEntry }) {
  return e.kind === "credit_note" ? (
    <a
      href={hrefOf(e)}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-11 items-center font-medium hover:underline md:min-h-0"
    >
      {e.label}
    </a>
  ) : (
    <Link
      href={hrefOf(e)}
      className="inline-flex min-h-11 items-center font-medium hover:underline md:min-h-0"
    >
      {e.label}
    </Link>
  );
}

/** On phones, where the columns aren't shown: "Billed ₹x", "Paid ₹x", "Credited ₹x", "Added back ₹x". */
function cardAmount(e: LedgerEntry) {
  if (e.kind === "invoice") return `Billed ${formatINR(e.debitPaise)}`;
  if (e.debitPaise > 0) return `Added back ${formatINR(e.debitPaise)}`;
  return `${e.kind === "payment" ? "Paid" : "Credited"} ${formatINR(e.creditPaise)}`;
}

const amount = (paise: number) => (paise === 0 ? "" : formatINR(paise));

async function TenantLedger({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => {
    const found = await getTenant(s, id);
    return found && { tenant: found.tenant, ledger: await ledgerFor(s, id) };
  });
  if (!data) notFound();
  const { tenant, ledger } = data;
  const today = todayInIndia();

  return (
    <>
      <Link
        href={`/tenants/${tenant.id}`}
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← {tenant.companyName}
      </Link>
      <PageHeader
        title="Ledger"
        description={`Everything billed to and paid by ${tenant.companyName}, oldest first. The balance is after each line. Balance now: ${balanceWords(ledger.closingPaise)}.`}
      />
      {ledger.entries.length === 0 ? (
        <Card className="max-w-2xl">
          <p className="text-sm">
            Nothing yet. Sent invoices and payments will show here; invoices not
            sent yet don&apos;t count.
          </p>
        </Card>
      ) : (
        <>
          <table className="hidden w-full max-w-5xl text-sm md:table">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Date</th>
                <th className="py-2 font-normal">What</th>
                <th className="py-2 text-right font-normal">Billed</th>
                <th className="py-2 text-right font-normal">
                  Paid or credited
                </th>
                <th className="py-2 text-right font-normal">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((e, i) => (
                <tr key={`${e.sourceId}-${e.kind}-${i}`} className="border-t">
                  <td className="py-2 tabular-nums">{formatDate(e.date)}</td>
                  <td className="py-2 break-words">
                    <What e={e} />
                    <Status
                      e={e}
                      statuses={ledger.invoiceStatus}
                      today={today}
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {amount(e.debitPaise)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {amount(e.creditPaise)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {balanceWords(e.balancePaise)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="py-2" colSpan={2}>
                  Total
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatINR(ledger.totalDebitPaise)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatINR(ledger.totalCreditPaise)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {balanceWords(ledger.closingPaise)}
                </td>
              </tr>
            </tfoot>
          </table>
          <ul className="flex flex-col divide-y rounded-lg border md:hidden">
            {ledger.entries.map((e, i) => (
              <li
                key={`${e.sourceId}-${e.kind}-${i}`}
                className="flex flex-col gap-1 p-4 text-sm"
              >
                <span className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">
                    <What e={e} />
                    <Status
                      e={e}
                      statuses={ledger.invoiceStatus}
                      today={today}
                    />
                  </span>
                  <span className="shrink-0 tabular-nums">{cardAmount(e)}</span>
                </span>
                <span className="flex justify-between gap-2 text-muted-foreground">
                  <span className="tabular-nums">{formatDate(e.date)}</span>
                  <span className="tabular-nums">
                    {balanceWords(e.balancePaise)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
