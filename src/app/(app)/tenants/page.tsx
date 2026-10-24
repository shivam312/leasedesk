import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TenantList } from "@/components/tenants/TenantList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { listTenants } from "@/lib/tenants/queries";

export const metadata: Metadata = { title: "Tenants" };

export default function TenantsPage() {
  return (
    <>
      <PageHeader
        title="Tenants"
        description="Everyone who rents from you, with their contacts."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading your tenants…</p>
        }
      >
        <Tenants />
      </Suspense>
    </>
  );
}

async function Tenants() {
  const member = await requireMember();
  const list = await runScoped(appDb, member, listTenants);
  const editable = can(member.role, "manage_tenants");

  return (
    <div className="flex flex-col gap-4">
      {editable && list.length > 0 && (
        <div>
          <Button asChild className="h-11 md:h-9">
            <Link href="/tenants/new">Add tenant</Link>
          </Button>
        </div>
      )}
      {list.length === 0 ? (
        <Card className="flex max-w-xl flex-col items-start gap-3">
          <p className="text-sm">
            No tenants yet. Add your first tenant: their name, billing address
            and the contact who receives invoices. A GSTIN is only needed if
            they&apos;re GST-registered.
          </p>
          {editable && (
            <Button asChild className="h-11 md:h-9">
              <Link href="/tenants/new">Add tenant</Link>
            </Button>
          )}
        </Card>
      ) : (
        <TenantList tenants={list} />
      )}
    </div>
  );
}
