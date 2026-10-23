import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { organizations, tenants } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { LEDGER_FIELDS, partyField } from "@/lib/exports/tally-form";
import { parseStoredSettings } from "@/lib/settings/schema";
import { resolveSettings } from "@/lib/settings/resolve";
import { saveTallyLedgers } from "@/server/actions/tally";

export const metadata: Metadata = { title: "Tally" };

export default function TallySettingsPage() {
  return (
    <>
      <Link
        href="/settings"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Settings
      </Link>
      <PageHeader
        title="Tally"
        description="The ledger names your accountant uses in TallyPrime, so the Tally file from Reports imports without renaming anything."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Ledgers />
      </Suspense>
    </>
  );
}

async function Ledgers() {
  const member = await requireMember();
  const { org, list } = await runScoped(appDb, member, async (s) => ({
    org: (
      await s.tx
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, member.organizationId))
    )[0],
    list: await s.tx
      .select({
        id: tenants.id,
        name: tenants.companyName,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(s.where(tenants))
      .orderBy(asc(tenants.companyName)),
  }));
  if (!org) return null;
  if (!can(member.role, "manage_settings"))
    return (
      <p className="text-sm text-muted-foreground">
        Ask an owner to change the Tally ledger names.
      </p>
    );
  const settings = resolveSettings({ organization: org.settings });
  return (
    <div className="max-w-2xl">
      <SimpleForm
        action={saveTallyLedgers}
        fields={[
          ...LEDGER_FIELDS.map(([key, label, hint]) => ({
            name: key,
            label: `${label} ledger`,
            hint,
            defaultValue: settings[key],
            required: true,
          })),
          ...list.map((t) => ({
            name: partyField(t.id),
            label: `${t.name}: party ledger`,
            hint: "Leave blank to use the tenant's name.",
            defaultValue:
              parseStoredSettings("tenant", t.settings)["tally.partyLedger"] ??
              "",
            advanced: true,
          })),
        ]}
        submitLabel="Save ledger names"
        pendingLabel="Saving…"
      />
    </div>
  );
}
