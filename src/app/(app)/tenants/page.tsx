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
        description="Everyone who rents from you, with their contacts and what is unpaid."
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
      {editable && (
        <div>
          <Button asChild>
            <Link href="/tenants/new">Add tenant</Link>
          </Button>
        </div>
      )}
      {list.length === 0 ? (
        <Card className="max-w-xl">
          <p className="text-sm">
            No tenants yet. Add your first tenant with their GSTIN and the
            contact who receives invoices.
          </p>
        </Card>
      ) : (
        <TenantList tenants={list} />
      )}
    </div>
  );
}
