import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { INVOICE_STATUS } from "@/components/invoices/status";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import { getInvoice } from "@/lib/invoices/queries";

export const metadata: Metadata = { title: "Invoice" };

export default function InvoicePage({
  params,
}: PageProps<"/billing/invoices/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the invoice…</p>
      }
    >
      <Invoice params={params} />
    </Suspense>
  );
}

async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, (s) => getInvoice(s, id));
  if (!data) notFound();
  const { invoice, tenant, building, lines } = data;
  const status = INVOICE_STATUS[invoice.status];
  const month = invoice.runMonth.slice(0, 7);
  const interState = invoice.supplyType === "inter_state";
  const totals: [string, number][] = [
    ["Before GST", invoice.taxableTotal],
    ...(interState
      ? ([["IGST", invoice.igstTotal]] as [string, number][])
      : ([
          ["CGST", invoice.cgstTotal],
          ["SGST", invoice.sgstTotal],
        ] as [string, number][])),
    ...(invoice.roundOff !== 0
      ? ([["Round off", invoice.roundOff]] as [string, number][])
      : []),
  ];

  return (
    <>
      <Link
        href={`/billing?month=${month}`}
        className="mb-2 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← {formatMonth(month)} invoices
      </Link>
      <PageHeader
        title={tenant.companyName}
        description={`${building.name} · ${invoice.number ?? "Number given when sent"}`}
      />
      <div className="flex max-w-3xl flex-col gap-6">
        {invoice.status === "draft" && (
          <p className="text-sm">
            Not sent yet. Making {formatMonth(month)} invoices again updates it
            with any lease changes.
          </p>
        )}
        <a
          href={`/billing/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener"
          download={invoice.status === "draft" ? undefined : true}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {invoice.status === "draft" ? "Preview PDF" : "Download PDF"}
        </a>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge tone={status.tone}>{status.label}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Invoice date</dt>
            <dd className="tabular-nums">{formatDate(invoice.invoiceDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="tabular-nums">{formatDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">
              {formatINR(invoice.grandTotal)}
            </dd>
          </div>
        </dl>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">What&apos;s billed</h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 p-4">
                <span className="flex items-start justify-between gap-4">
                  <span className="break-words">{l.description}</span>
                  <span className="tabular-nums">
                    {formatINR(l.taxableAmount)}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {[
                    l.quantityLabel,
                    `GST ${formatINR(l.cgst + l.sgst + l.igst)}`,
                    `SAC ${l.sacCode}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-1 text-sm">
          {totals.map(([label, amount]) => (
            <p key={label} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{formatINR(amount)}</span>
            </p>
          ))}
          <p className="flex justify-between gap-4 border-t pt-2 font-medium">
            <span>Total</span>
            <span className="tabular-nums">
              {formatINR(invoice.grandTotal)}
            </span>
          </p>
          {invoice.expectedTds > 0 && (
            <p className="flex justify-between gap-4 text-muted-foreground">
              <span>TDS the tenant may deduct</span>
              <span className="tabular-nums">
                {formatINR(invoice.expectedTds)}
              </span>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
