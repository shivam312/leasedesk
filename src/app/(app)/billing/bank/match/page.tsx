import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MatchList } from "@/components/bank/MatchList";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { appDb, requireMember } from "@/lib/auth";
import { linesToMatch } from "@/lib/bank/match";
import { runScoped } from "@/lib/db/scoped";
import { listTenants } from "@/lib/tenants/queries";
import { confirmMatchesAction, ignoreLinesAction } from "@/server/actions/bank";

export const metadata: Metadata = { title: "Match payments" };

export default function MatchPage() {
  return (
    <RequirePermission
      permission="manage_billing"
      message="Only an owner or accounts person can match payments."
      back={{ href: "/billing/payments", label: "Back to payments" }}
    >
      <Link
        href="/billing/payments"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Payments
      </Link>
      <PageHeader
        title="Match payments"
        description="Money from your bank statements, with the tenant we think paid it. Check the ticked ones, then record them as payments."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading bank lines…</p>
        }
      >
        <Match />
      </Suspense>
    </RequirePermission>
  );
}

async function Match() {
  const member = await requireMember();
  const [lines, tenants] = await runScoped(appDb, member, (s) =>
    Promise.all([linesToMatch(s), listTenants(s)]),
  );
  if (lines.length === 0)
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm">
          Nothing to match. Import your latest bank statement to match the money
          received to tenants&apos; invoices.
        </p>
        <Link
          href="/billing/bank"
          className={buttonVariants({ className: "h-11 self-start md:h-9" })}
        >
          Import bank statement
        </Link>
      </div>
    );
  return (
    <MatchList
      rows={lines.map((l) => ({
        id: l.line.id,
        date: l.line.date,
        description: l.line.description,
        reference: l.line.reference,
        creditPaise: l.line.creditAmount,
        account: `${l.bankName} ending ${l.accountLast4}`,
        tenantId: l.line.suggestedTenantId,
        confidence: l.line.confidence,
        invoiceNumbers: l.invoiceNumbers,
        tdsPaise: l.line.suggestedTdsAmount,
      }))}
      tenants={tenants.map((t) => ({ id: t.id, name: t.companyName }))}
      confirmAction={confirmMatchesAction}
      ignoreAction={ignoreLinesAction}
    />
  );
}
