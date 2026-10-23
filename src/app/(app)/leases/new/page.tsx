import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LeaseForm } from "@/components/leases/LeaseForm";
import { billingRuleFields } from "@/components/settings/billing-rules";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { appDb, requireMember } from "@/lib/auth";
import { monthsBetween } from "@/lib/billing/dates";
import { runScoped } from "@/lib/db/scoped";
import { leaseTemplate, type LeaseTemplateSource } from "@/lib/leases/copy";
import { blankLeaseForm, leaseFormFrom } from "@/lib/leases/prefill";
import {
  getLease,
  leaseFormOptions,
  type SavedLease,
} from "@/lib/leases/queries";
import { renewalDraft } from "@/lib/leases/renewal";
import { billingSettings } from "@/lib/settings/billing";
import { keysForScope } from "@/lib/settings/schema";
import { loadSettings } from "@/lib/settings/store";

export const metadata: Metadata = { title: "Add lease" };

const isId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

export default function NewLeasePage({
  searchParams,
}: PageProps<"/leases/new">) {
  return (
    <>
      <PageHeader
        title="Add lease"
        description="Enter the lease once: the tenant, units, dates and rent. You'll see every month's rent before saving."
      />
      <RequirePermission
        permission="manage_leases"
        message="Only an owner or property manager can add leases."
        back={{ href: "/leases", label: "Back to Leases" }}
      >
        <Suspense
          fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
        >
          <Form searchParams={searchParams} />
        </Suspense>
      </RequirePermission>
    </>
  );
}

function templateSource(saved: SavedLease): LeaseTemplateSource {
  const { lease, input } = saved;
  return {
    buildingId: lease.buildingId,
    areaBasis: lease.areaBasis,
    noticePeriodMonths: lease.noticePeriodMonths,
    rentFreeMonths: lease.rentFreeMonths,
    rentFreeDays: lease.rentFreeDays,
    settings: (lease.settings ?? {}) as Record<string, unknown>,
    charges: input.charges,
    escalationRules: input.escalationRules ?? [],
  };
}

async function Form({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { copy, renew } = await searchParams;
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => {
    const options = await leaseFormOptions(s);
    const settingFields = billingRuleFields(
      keysForScope("lease"),
      {},
      await loadSettings(s),
    );
    if (isId(renew)) {
      const saved = await getLease(s, renew);
      if (!saved) return null;
      const { lease } = saved;
      const settings = await loadSettings(s, {
        buildingId: lease.buildingId,
        tenantId: lease.tenantId,
        leaseSettings: lease.settings,
      });
      // Suggest the same term as the old lease; the user can change the dates.
      const term = monthsBetween(lease.startDate, lease.endDate).length;
      const draft = renewalDraft(
        {
          ...templateSource(saved),
          id: lease.id,
          tenantId: lease.tenantId,
          unitIds: saved.units.map((u) => u.unitId),
          version: lease.version,
          endDate: lease.endDate,
          status: lease.status,
        },
        term,
        billingSettings(settings),
      );
      return {
        options,
        settingFields,
        initial: leaseFormFrom(draft),
        replacesLeaseId: lease.id,
        note: `Renewing ${saved.tenantName}'s lease, version ${draft.version}. The amounts start from the current lease's starting rent, before its increases: check them before saving.`,
      };
    }
    if (isId(copy)) {
      const saved = await getLease(s, copy);
      if (!saved) return null;
      return {
        options,
        settingFields,
        initial: leaseFormFrom(leaseTemplate(templateSource(saved))),
        replacesLeaseId: null,
        note: `Copied from ${saved.tenantName}'s lease: the charges, rent increases and notice period. Choose the tenant, units and dates.`,
      };
    }
    return {
      options,
      settingFields,
      initial: blankLeaseForm(),
      replacesLeaseId: null,
    };
  }).catch((error: unknown) => {
    // renewalDraft refuses a draft or an already renewed lease.
    if (error instanceof Error && /renew/.test(error.message))
      return { refused: true as const };
    throw error;
  });
  if (!data) notFound();
  if ("refused" in data)
    return (
      <div className="flex max-w-2xl flex-col gap-3 text-sm">
        <p>
          This lease can&apos;t be renewed: it&apos;s a draft, or it has already
          been renewed.
        </p>
        <Link href="/leases" className="underline">
          Back to Leases
        </Link>
      </div>
    );
  if (data.options.tenants.length === 0 || data.options.buildings.length === 0)
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm">
          To add a lease you need a tenant and a building with units.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.options.tenants.length === 0 && (
            <Button asChild className="h-11 md:h-9">
              <Link href="/tenants/new">Add a tenant</Link>
            </Button>
          )}
          {data.options.buildings.length === 0 && (
            <Button
              asChild
              variant={
                data.options.tenants.length === 0 ? "outline" : "default"
              }
              className="h-11 md:h-9"
            >
              <Link href="/leases/buildings/new">Add a building</Link>
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {"note" in data && data.note && (
        <p className="max-w-2xl text-sm text-muted-foreground">{data.note}</p>
      )}
      <LeaseForm
        initial={data.initial}
        options={data.options}
        settingFields={data.settingFields}
        replacesLeaseId={data.replacesLeaseId}
      />
    </div>
  );
}
