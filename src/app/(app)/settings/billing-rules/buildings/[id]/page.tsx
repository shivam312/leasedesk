import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { billingRuleFields } from "@/components/settings/billing-rules";
import { PageHeader } from "@/components/shell/PageHeader";
import { appDb, requireMember } from "@/lib/auth";
import { buildings, organizations } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { shownKeys } from "@/lib/settings/labels";
import { resolveSettings } from "@/lib/settings/resolve";
import { keysForScope, parseStoredSettings } from "@/lib/settings/schema";
import { saveBillingRules } from "@/server/actions/billing-rules";

export const metadata: Metadata = { title: "Building defaults" };

export default function BuildingRulesPage({
  params,
}: PageProps<"/settings/billing-rules/buildings/[id]">) {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <BuildingRules params={params} />
    </Suspense>
  );
}

async function BuildingRules({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const { building, org } = await runScoped(
    appDb,
    member,
    async ({ tx, where }) => ({
      building: (
        await tx
          .select()
          .from(buildings)
          .where(where(buildings, eq(buildings.id, id)))
      )[0],
      org: (
        await tx
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, member.organizationId))
      )[0],
    }),
  );
  if (!building || !org) notFound();

  return (
    <>
      <PageHeader
        title={`${building.name}: defaults`}
        description="Used for new leases and charges in this building. Leave a field as it is to follow your business's rules."
      />
      <SimpleForm
        action={saveBillingRules.bind(null, building.id)}
        fields={billingRuleFields(
          shownKeys("building", keysForScope),
          parseStoredSettings("building", building.settings),
          resolveSettings({ organization: org.settings }),
        )}
        submitLabel="Save building defaults"
        pendingLabel="Saving…"
      />
    </>
  );
}
