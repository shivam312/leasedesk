import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { InvoiceList } from "@/components/invoices/InvoiceList";
import { RunBillingForm } from "@/components/invoices/RunBillingForm";
import { SendAllForm } from "@/components/invoices/SendForms";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { startOfMonth } from "@/lib/billing/dates";
import { formatINR, formatMonth } from "@/lib/format";
import {
  billingMonth,
  monthChoices,
  sendAllConsequence,
  tooEarlyToSend,
} from "@/lib/invoices/forms";
import { invoicesForMonth, leasesWithoutInvoice } from "@/lib/invoices/run";
import { draftTenantsWithoutEmail } from "@/lib/invoices/send";
import { todayInIndia } from "@/lib/today";
import { cn } from "@/lib/utils";
import {
  runBillingNow,
  sendAllInvoices,
  sendSelectedInvoices,
} from "@/server/actions/billing";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Make each month's invoices and check them before sending."
      />
      <p className="-mt-3 mb-6 text-sm">
        <Link
          href="/billing/payments"
          className={buttonVariants({
            variant: "outline",
            className: "h-11 md:h-9",
          })}
        >
          Payments
        </Link>
      </p>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading invoices…</p>
        }
      >
        <Month searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Month({
  searchParams,
}: {
  searchParams: PageProps<"/billing">["searchParams"];
}) {
  const { month: param } = await searchParams;
  // Today is request data: Next.js only lets the page read the clock at
  // request time, not while prerendering.
  await connection();
  const today = todayInIndia();
  const month = billingMonth(param, today);
  return (
    <>
      <nav aria-label="Month" className="mb-6 flex flex-wrap gap-2">
        {monthChoices(today).map((m) => (
          <Link
            key={m.value}
            href={`/billing?month=${m.value}`}
            aria-current={m.value === month ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
              m.value === month && "bg-primary text-primary-foreground",
            )}
          >
            {m.label}
          </Link>
        ))}
      </nav>
      <MonthInvoices month={month} />
    </>
  );
}

async function MonthInvoices({ month }: { month: string }) {
  const member = await requireMember();
  const [rows, noEmail, missing] = await runScoped(appDb, member, (s) =>
    Promise.all([
      invoicesForMonth(s, month),
      draftTenantsWithoutEmail(s, month),
      leasesWithoutInvoice(s, month),
    ]),
  );
  const canBill = can(member.role, "manage_billing");
  const label = formatMonth(month);
  const drafts = rows.filter((r) => r.status === "draft");
  // A month's invoices are dated its 1st (D23).
  const early = tooEarlyToSend(startOfMonth(month), todayInIndia());
  return (
    <div className="flex flex-col gap-6">
      {canBill && drafts.length > 0 && early && (
        <p className="max-w-2xl text-sm">{early}</p>
      )}
      {canBill && drafts.length > 0 && !early && (
        <SendAllForm
          month={month}
          monthLabel={label}
          count={drafts.length}
          total={formatINR(drafts.reduce((sum, r) => sum + r.grandTotal, 0))}
          consequence={sendAllConsequence(noEmail)}
          action={sendAllInvoices}
        />
      )}
      {/* Once every invoice made is sent, making the month again is only
          for leases with no invoice yet (a lease added since). */}
      {canBill && (rows.length === 0 || drafts.length > 0 || missing > 0) && (
        <RunBillingForm
          month={month}
          monthLabel={label}
          hasDrafts={drafts.length > 0}
          missing={rows.length > 0 && drafts.length === 0}
          primary={drafts.length === 0}
          action={runBillingNow}
        />
      )}
      {canBill && rows.length > 0 && drafts.length === 0 && missing === 0 && (
        <p className="max-w-2xl text-sm">
          Every {label} invoice is made and sent.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="max-w-2xl text-sm">
          No invoices for {label} yet.{" "}
          {canBill
            ? `Make ${label} invoices to work out what every tenant owes.`
            : "An owner or accounts person can make them."}
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">
            {label} invoices ({rows.length})
          </h2>
          <InvoiceList
            invoices={rows}
            today={todayInIndia()}
            send={
              canBill && drafts.length > 1 && !early
                ? {
                    month,
                    monthLabel: label,
                    consequence: sendAllConsequence(noEmail),
                    action: sendSelectedInvoices,
                  }
                : undefined
            }
          />
        </section>
      )}
    </div>
  );
}
