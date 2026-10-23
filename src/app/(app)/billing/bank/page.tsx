import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatementImport } from "@/components/bank/StatementImport";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { listBankAccounts, recentImports } from "@/lib/bank/imports";
import { runScoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { billingEntityOptions } from "@/lib/property/queries";
import {
  addBankAccountAction,
  importStatementAction,
} from "@/server/actions/bank";

export const metadata: Metadata = { title: "Import bank statement" };

export default function BankPage() {
  return (
    <RequirePermission
      permission="manage_billing"
      message="Only an owner or accounts person can import bank statements."
      back={{ href: "/billing/payments", label: "Back to payments" }}
    >
      <Link
        href="/billing/payments"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Payments
      </Link>
      <PageHeader
        title="Import bank statement"
        description="Bring in the money received from your bank's statement, so you can match it to tenants' invoices."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Loading bank accounts…
          </p>
        }
      >
        <Bank />
      </Suspense>
    </RequirePermission>
  );
}

async function Bank() {
  const member = await requireMember();
  const [accounts, entities, imports] = await runScoped(appDb, member, (s) =>
    Promise.all([
      listBankAccounts(s),
      billingEntityOptions(s),
      recentImports(s),
    ]),
  );
  const addForm = (
    <SimpleForm
      action={addBankAccountAction}
      submitLabel="Add bank account"
      pendingLabel="Adding…"
      secondary={accounts.length > 0}
      fields={[
        {
          name: "billingEntityId",
          label: "Whose account",
          type: "select",
          required: true,
          options: entities.map((e) => ({
            value: e.id,
            label: e.gstin ? `${e.legalName} (${e.gstin})` : e.legalName,
          })),
        },
        {
          name: "bankName",
          label: "Bank",
          required: true,
          hint: "e.g. HDFC Bank",
        },
        {
          name: "accountLast4",
          label: "Last 4 digits of the account number",
          required: true,
          inputMode: "numeric",
        },
      ]}
    />
  );
  if (entities.length === 0)
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm">
          Add your business details first, so we know whose bank account this
          is.
        </p>
        <Link
          href="/settings/business"
          className={buttonVariants({ className: "h-11 self-start md:h-9" })}
        >
          Go to business settings
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-10">
      {accounts.length === 0 ? (
        <section className="flex max-w-2xl flex-col gap-3">
          <p className="text-sm">
            First, add the bank account your tenants pay into. Only the last 4
            digits are kept.
          </p>
          {addForm}
        </section>
      ) : (
        <StatementImport
          // A saved mapping or a new account starts the form afresh.
          key={accounts
            .map((a) => `${a.id}:${JSON.stringify(a.columnMapping)}`)
            .join("|")}
          accounts={accounts.map((a) => ({
            id: a.id,
            label: `${a.bankName} ending ${a.accountLast4} (${a.entityName})`,
            columnMapping: a.columnMapping,
          }))}
          action={importStatementAction}
        />
      )}

      {imports.length > 0 && (
        <section className="max-w-2xl" aria-labelledby="imports-heading">
          <h2 id="imports-heading" className="mb-2 font-medium">
            Earlier imports
          </h2>
          <ul className="flex flex-col text-sm">
            {imports.map((i) => (
              <li key={i.import.id} className="border-b py-2">
                <Link
                  href={`/billing/bank/imports/${i.import.id}`}
                  className="inline-flex min-h-11 items-center underline md:min-h-0"
                >
                  {i.import.fileName}
                </Link>{" "}
                <span className="text-muted-foreground">
                  {i.bankName} ending {i.accountLast4}
                  {i.import.periodStart && i.import.periodEnd
                    ? `, ${formatDate(i.import.periodStart)} to ${formatDate(i.import.periodEnd)}`
                    : ""}
                  , {i.import.lineCount}{" "}
                  {i.import.lineCount === 1 ? "payment" : "payments"} received
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accounts.length > 0 && (
        <details className="max-w-2xl">
          <summary className="min-h-11 cursor-pointer text-sm underline md:min-h-0">
            Add another bank account
          </summary>
          <div className="mt-4">{addForm}</div>
        </details>
      )}
    </div>
  );
}
