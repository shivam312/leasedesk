import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { addMonthsToMonth, monthOf } from "@/lib/billing/dates";
import { formatMonth } from "@/lib/format";
import { todayInIndia } from "@/lib/today";
import Link from "next/link";
import { Suspense } from "react";
import { PaymentList } from "@/components/payments/PaymentList";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { countLinesToMatch } from "@/lib/bank/match";
import { recentPayments } from "@/lib/payments/payments";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage({
  searchParams,
}: PageProps<"/billing/payments">) {
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
        <Payments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Payments({
  searchParams,
}: {
  searchParams: PageProps<"/billing/payments">["searchParams"];
}) {
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.slice(0, 80) : "";
  const month =
    typeof search.month === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
      ? search.month
      : null;
  const filtered = !!(q.trim() || month);
  const member = await requireMember();
  const [rows, toMatch] = await runScoped(appDb, member, (s) =>
    Promise.all([recentPayments(s, { q, month }), countLinesToMatch(s)]),
  );
  const thisMonth = monthOf(todayInIndia());
  const months = Array.from({ length: 12 }, (_, i) =>
    addMonthsToMonth(thisMonth, -i),
  );
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
          <Link
            href="/billing/tds"
            className={buttonVariants({
              variant: "outline",
              className: "h-11 md:h-9",
            })}
          >
            TDS certificates
          </Link>
          {toMatch > 0 && (
            <Link
              href="/billing/bank/match"
              className={buttonVariants({
                variant: "outline",
                className: "h-11 md:h-9",
              })}
            >
              Match payments ({toMatch})
            </Link>
          )}
        </div>
      )}
      <form
        method="get"
        className="flex flex-col gap-2 md:flex-row md:items-end"
        aria-label="Find payments"
      >
        <Input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search payments"
          placeholder="Search by tenant or reference (UTR, cheque number)"
          className="md:max-w-sm"
        />
        <Select
          name="month"
          defaultValue={month ?? ""}
          aria-label="Month received"
          className="md:w-44"
        >
          <option value="">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" className="h-11 md:h-9">
          Show
        </Button>
      </form>
      {filtered && rows.length === 0 ? (
        <p className="max-w-2xl text-sm">
          No payments match.{" "}
          <Link href="/billing/payments" className="underline">
            Show all payments
          </Link>
        </p>
      ) : rows.length === 0 && !canBill ? (
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
