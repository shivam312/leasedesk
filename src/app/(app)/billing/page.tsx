import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvoiceList } from "@/components/invoices/InvoiceList";
import { RunBillingForm } from "@/components/invoices/RunBillingForm";
import { SendAllForm } from "@/components/invoices/SendForms";
import { PageHeader } from "@/components/shell/PageHeader";
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
import { invoicesForMonth } from "@/lib/invoices/run";
import { draftTenantsWithoutEmail } from "@/lib/invoices/send";
import { todayInIndia } from "@/lib/today";
import { cn } from "@/lib/utils";
import { runBillingNow, sendAllInvoices } from "@/server/actions/billing";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Make each month's invoices and check them before sending."
      />
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
  const [rows, noEmail] = await runScoped(appDb, member, (s) =>
    Promise.all([
      invoicesForMonth(s, month),
      draftTenantsWithoutEmail(s, month),
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
      {canBill && (
        <RunBillingForm
          month={month}
          monthLabel={label}
          hasDrafts={drafts.length > 0}
          action={runBillingNow}
        />
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
          <InvoiceList invoices={rows} />
        </section>
      )}
    </div>
  );
}
