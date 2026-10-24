import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Export all data" };

export default function ExportPage() {
  return (
    <>
      <Link
        href="/settings"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Settings
      </Link>
      <PageHeader
        title="Export all data"
        description="Everything in your account, to keep or take elsewhere: your data is yours."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Export />
      </Suspense>
    </>
  );
}

async function Export() {
  const member = await requireMember();
  if (!can(member.role, "manage_settings"))
    return (
      <p className="max-w-2xl text-sm">
        Only an owner can export all data. Ask the person who set up LeaseDesk.
      </p>
    );
  return (
    <div className="flex max-w-2xl flex-col gap-4 text-sm">
      <p>
        One zip file with an Excel file for each kind of record (your business
        details, buildings, units, tenants, leases, invoices and their lines,
        credit notes, payments, deposits, TDS and opening balances), every
        invoice PDF as it was sent, and every document you uploaded. A
        &ldquo;Read me&rdquo; inside says how amounts and areas are written.
      </p>
      <p className="text-muted-foreground">
        It can take a minute with many documents. Each export is recorded in the
        activity log.
      </p>
      <div>
        <a
          href="/settings/export/download"
          download
          className={buttonVariants({ className: "h-11 md:h-9" })}
        >
          Download all data (.zip)
        </a>
      </div>
    </div>
  );
}
