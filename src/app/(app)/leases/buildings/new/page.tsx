import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { buildingFields } from "@/components/property/fields";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { billingEntityOptions } from "@/lib/property/queries";
import { saveBuilding } from "@/server/actions/property";

export const metadata: Metadata = { title: "Add building" };

export default function NewBuildingPage() {
  return (
    <>
      <PageHeader title="Add building" />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <NewBuilding />
      </Suspense>
    </>
  );
}

async function NewBuilding() {
  const member = await requireMember();
  const entities = await runScoped(appDb, member, billingEntityOptions);
  if (entities.length === 0) {
    return (
      <Card className="max-w-xl">
        <p className="text-sm">
          First add the GSTIN or business name your invoices come from, in{" "}
          <Link href="/settings/business/entities/new" className="underline">
            Business details
          </Link>
          . Then come back to add the building.
        </p>
      </Card>
    );
  }
  return (
    <SimpleForm
      action={saveBuilding.bind(null, null)}
      fields={buildingFields(entities)}
      submitLabel="Add building"
      pendingLabel="Adding…"
    />
  );
}
