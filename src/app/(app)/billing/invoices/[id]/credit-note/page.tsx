import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CreditNoteForm } from "@/components/invoices/CreditNoteForm";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { creditNoteDeadline } from "@/lib/billing/credit-note";
import { formatDate } from "@/lib/format";
import { creditableInvoice, creditRefusal } from "@/lib/invoices/credit-notes";
import { recipientsFor } from "@/lib/invoices/send";
import { todayInIndia } from "@/lib/today";
import { issueCreditNoteAction } from "@/server/actions/billing";

export const metadata: Metadata = { title: "Issue a credit note" };

export default function CreditNotePage({
  params,
}: PageProps<"/billing/invoices/[id]/credit-note">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the invoice…</p>
      }
    >
      <CreditNote params={params} />
    </Suspense>
  );
}

async function CreditNote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => {
    const c = await creditableInvoice(s, id);
    return c ? { ...c, to: await recipientsFor(s, c.invoice.tenantId) } : null;
  });
  if (!data) notFound();
  const { invoice } = data;
  const today = todayInIndia();
  const refusal = creditRefusal(invoice, today);
  return (
    <RequirePermission
      permission="manage_billing"
      message="Only an owner or accounts person can issue credit notes."
      back={{
        href: `/billing/invoices/${invoice.id}`,
        label: "Back to the invoice",
      }}
    >
      <Link
        href={`/billing/invoices/${invoice.id}`}
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Back to {invoice.number ? `invoice ${invoice.number}` : "the invoice"}
      </Link>
      <PageHeader
        title="Issue a credit note"
        description={`Take money off ${invoice.number ? `invoice ${invoice.number}` : "this invoice"}. The invoice itself never changes.`}
      />
      {refusal ? (
        <div
          role="alert"
          className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4"
        >
          <p className="text-sm">{refusal}</p>
          <Link
            href={`/billing/invoices/${invoice.id}`}
            className={buttonVariants({
              variant: "outline",
              className: "h-11 self-start md:h-9",
            })}
          >
            Back to the invoice
          </Link>
        </div>
      ) : (
        <CreditNoteForm
          invoiceId={invoice.id}
          supply={invoice.supplyType}
          roundOff={invoice.roundOff}
          creditedRoundOff={data.creditedRoundOff}
          lines={data.lines}
          to={data.to}
          dateLabel={formatDate(today)}
          deadlineLabel={formatDate(creditNoteDeadline(invoice.invoiceDate))}
          action={issueCreditNoteAction}
        />
      )}
    </RequirePermission>
  );
}
