import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReversePaymentForm } from "@/components/payments/ReversePaymentForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, FormMessage } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR } from "@/lib/format";
import { PAYMENT_MODES } from "@/lib/payments/forms";
import { getPayment, paymentSummary } from "@/lib/payments/payments";
import { reversePaymentAction } from "@/server/actions/payments";

export const metadata: Metadata = { title: "Payment" };

export default function PaymentPage({
  params,
  searchParams,
}: PageProps<"/billing/payments/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the payment…</p>
      }
    >
      <Payment params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Payment({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { recorded } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, (s) => getPayment(s, id));
  if (!data) notFound();
  const { payment: p, tenantName, allocations, tds, related } = data;
  const reversal = p.kind === "reversal";
  const applied = allocations.reduce((sum, a) => sum + a.amount, 0);
  const credit = reversal ? 0 : p.amountReceived + p.tdsDeducted - applied;
  const canBill = can(member.role, "manage_billing");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/tenants/${p.tenantId}`}
          className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
        >
          ← {tenantName}
        </Link>
        <PageHeader
          title={
            reversal
              ? `Reversal of ${formatINR(-p.amountReceived)}`
              : `Payment of ${formatINR(p.amountReceived)}`
          }
          description={`From ${tenantName}, ${reversal ? "reversed on" : "received on"} ${formatDate(p.receivedDate)}.`}
        />
        <div className="-mt-3 flex flex-wrap gap-2">
          {reversal && <Badge tone="warn">Reversal</Badge>}
          {p.status === "reversed" && <Badge>Reversed</Badge>}
        </div>
      </div>
      {recorded === "1" && !reversal && p.status === "active" && (
        <FormMessage
          tone="success"
          message={`Recorded ${paymentSummary(p)}.${credit > 0 ? ` ${formatINR(credit)} is kept as credit for later invoices.` : ""}`}
        />
      )}

      <dl className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium tabular-nums">{paymentSummary(p)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">How they paid</dt>
          <dd className="font-medium">
            {[PAYMENT_MODES[p.mode], p.reference].filter(Boolean).join(" · ")}
          </dd>
        </div>
        {p.note && (
          <div className="md:col-span-2">
            <dt className="text-muted-foreground">
              {reversal ? "Why it was reversed" : "Note"}
            </dt>
            <dd className="break-words">{p.note}</dd>
          </div>
        )}
        {related && (
          <div className="md:col-span-2">
            <dt className="text-muted-foreground">
              {reversal ? "Reverses" : "Reversed by"}
            </dt>
            <dd>
              <Link
                href={`/billing/payments/${related.id}`}
                className="inline-flex min-h-11 items-center underline md:min-h-0"
              >
                {reversal
                  ? `The payment of ${formatINR(related.amountReceived)} received ${formatDate(related.receivedDate)}`
                  : `A reversal on ${formatDate(related.receivedDate)}`}
              </Link>
            </dd>
          </div>
        )}
      </dl>

      <section className="max-w-2xl" aria-labelledby="applied-heading">
        <h2 id="applied-heading" className="mb-2 font-medium">
          {reversal ? "Taken back off invoices" : "Applied to invoices"}
        </h2>
        {allocations.length === 0 ? (
          <p className="text-sm">Not applied to any invoice.</p>
        ) : (
          <ul className="flex flex-col text-sm">
            {allocations.map((a) => {
              const t = tds.find((r) => r.invoiceId === a.invoiceId);
              return (
                <li
                  key={a.invoiceId}
                  className="flex flex-wrap justify-between gap-x-4 border-b py-2"
                >
                  <Link
                    href={`/billing/invoices/${a.invoiceId}`}
                    className="inline-flex min-h-11 items-center underline md:min-h-0"
                  >
                    {a.number}{" "}
                    <span className="text-muted-foreground">
                      dated {formatDate(a.invoiceDate)}
                    </span>
                  </Link>
                  <span className="tabular-nums">
                    {formatINR(a.amount)}
                    {t
                      ? ` (${formatINR(t.amount)} of it TDS the tenant kept back)`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {credit > 0 && p.status === "active" && (
          <p className="mt-2 text-sm">
            {formatINR(credit)} was paid in advance and isn&apos;t applied to an
            invoice yet. Apply it from the{" "}
            <Link href={`/tenants/${p.tenantId}`} className="underline">
              tenant&apos;s page
            </Link>{" "}
            once their next invoice is sent.
          </p>
        )}
      </section>

      {canBill && !reversal && p.status === "active" && (
        <ReversePaymentForm
          paymentId={p.id}
          tenantId={p.tenantId}
          amountLabel={applied > 0 ? formatINR(applied) : null}
          action={reversePaymentAction}
        />
      )}
    </div>
  );
}
