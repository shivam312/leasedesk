import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PaymentList } from "@/components/payments/PaymentList";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { recentPayments } from "@/lib/payments/payments";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <>
      <Link
        href="/billing"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Billing
      </Link>
      <PageHeader
        title="Payments"
        description="Money received from tenants, with the TDS they kept back."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        }
      >
        <Payments />
      </Suspense>
    </>
  );
}

async function Payments() {
  const member = await requireMember();
  const rows = await runScoped(appDb, member, (s) => recentPayments(s));
  const canBill = can(member.role, "manage_billing");
  return (
    <div className="flex flex-col gap-6">
      {canBill && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/billing/payments/new"
            className={buttonVariants({ className: "h-11 md:h-9" })}
          >
            Record payment
          </Link>
          <Link
            href="/billing/bank"
            className={buttonVariants({
              variant: "outline",
              className: "h-11 md:h-9",
            })}
          >
            Import bank statement
          </Link>
        </div>
      )}
      {rows.length === 0 && !canBill ? (
        <p className="max-w-2xl text-sm">
          No payments yet. Payments recorded by the owner or accounts person
          show here.
        </p>
      ) : rows.length === 0 ? (
        <p className="max-w-2xl text-sm">
          No payments yet. When a tenant pays, record it here so their invoices
          show as paid.
        </p>
      ) : (
        <PaymentList
          payments={rows.map((r) => ({
            ...r.payment,
            tenantName: r.tenantName,
          }))}
        />
      )}
    </div>
  );
}
