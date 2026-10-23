import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { formatINR } from "@/lib/format";
import { paymentSettings, unpaidInvoices } from "@/lib/payments/payments";
import { getTenant, listTenants } from "@/lib/tenants/queries";
import { todayInIndia } from "@/lib/today";
import { recordPaymentAction } from "@/server/actions/payments";

export const metadata: Metadata = { title: "Record a payment" };

export default function NewPaymentPage({
  searchParams,
}: PageProps<"/billing/payments/new">) {
  return (
    <RequirePermission
      permission="manage_billing"
      message="Only an owner or accounts person can record payments."
      back={{ href: "/billing/payments", label: "Back to payments" }}
    >
      <Link
        href="/billing/payments"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Payments
      </Link>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <NewPayment searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function NewPayment({
  searchParams,
}: {
  searchParams: PageProps<"/billing/payments/new">["searchParams"];
}) {
  const { tenant: param, q } = await searchParams;
  const search = typeof q === "string" ? q.trim().toLowerCase() : "";
  await connection();
  const member = await requireMember();
  const tenantId =
    typeof param === "string" && /^[0-9a-f-]{36}$/.test(param) ? param : null;

  if (!tenantId) {
    const all = await runScoped(appDb, member, (s) => listTenants(s));
    const tenants = search
      ? all.filter((t) => t.companyName.toLowerCase().includes(search))
      : all;
    return (
      <>
        <PageHeader
          title="Record a payment"
          description="Choose the tenant who paid. You'll then enter the amount and the TDS they kept back."
        />
        {all.length > 20 && (
          <form method="get" className="mb-4 flex max-w-2xl gap-2">
            <label htmlFor="q" className="sr-only">
              Search tenants
            </label>
            <Input
              id="q"
              name="q"
              type="search"
              placeholder="Search tenants"
              defaultValue={search}
            />
            <Button type="submit" variant="outline" className="h-11 md:h-9">
              Search
            </Button>
          </form>
        )}
        {all.length > 0 && tenants.length === 0 ? (
          <p className="text-sm">
            No tenant matches &ldquo;{search}&rdquo;.{" "}
            <Link href="/billing/payments/new" className="underline">
              Show all tenants
            </Link>
          </p>
        ) : tenants.length === 0 ? (
          <p className="text-sm">
            No tenants yet.{" "}
            <Link href="/tenants/new" className="underline">
              Add a tenant
            </Link>{" "}
            first.
          </p>
        ) : (
          <form method="get" className="flex max-w-2xl flex-col gap-4">
            <label htmlFor="tenant" className="text-sm font-medium">
              Tenant
            </label>
            <Select id="tenant" name="tenant" required defaultValue="">
              <option value="" disabled>
                Choose a tenant
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.companyName}
                </option>
              ))}
            </Select>
            <div>
              <Button type="submit" className="h-11 md:h-9">
                Next
              </Button>
            </div>
          </form>
        )}
      </>
    );
  }

  const data = await runScoped(appDb, member, async (s) => {
    const tenant = await getTenant(s, tenantId);
    if (!tenant) return null;
    const settings = await paymentSettings(s, tenantId);
    return {
      tenant: tenant.tenant,
      settings,
      invoices: await unpaidInvoices(s, tenantId, settings),
    };
  });
  if (!data)
    return (
      <p className="text-sm">
        That tenant couldn&apos;t be found.{" "}
        <Link href="/billing/payments/new" className="underline">
          Choose another tenant
        </Link>
        .
      </p>
    );
  const owed = data.invoices.reduce((sum, i) => sum + i.outstandingPaise, 0);
  return (
    <>
      <PageHeader
        title={`Payment from ${data.tenant.companyName}`}
        description={
          data.invoices.length > 0
            ? `${formatINR(owed)} unpaid on ${data.invoices.length} ${data.invoices.length === 1 ? "invoice" : "invoices"}.`
            : "Nothing unpaid right now."
        }
      />
      <PaymentForm
        tenantId={data.tenant.id}
        invoices={data.invoices.map((i) => ({
          id: i.id,
          number: i.number,
          dueDate: i.dueDate,
          invoiceDate: i.invoiceDate,
          outstandingPaise: i.outstandingPaise,
          expectedTdsPaise: i.expectedTdsPaise,
          grandTotalPaise: i.grandTotalPaise,
        }))}
        tolerancePaise={data.settings.tdsTolerancePaise}
        today={todayInIndia()}
        action={recordPaymentAction}
      />
    </>
  );
}
