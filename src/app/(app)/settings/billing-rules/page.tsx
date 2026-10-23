import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { billingRuleFields } from "@/components/settings/billing-rules";
import { PageHeader } from "@/components/shell/PageHeader";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { buildings, organizations } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { shownKeys } from "@/lib/settings/labels";
import { keysForScope, parseStoredSettings } from "@/lib/settings/schema";
import { saveBillingRules } from "@/server/actions/billing-rules";

export const metadata: Metadata = { title: "Billing rules" };

export default function BillingRulesPage() {
  return (
    <>
      <PageHeader
        title="Billing rules"
        description="How rent, GST and TDS are worked out. The defaults suit most landlords; change one only if your invoices differ."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Rules />
      </Suspense>
    </>
  );
}

async function Rules() {
  const member = await requireMember();
  const { org, list } = await runScoped(
    appDb,
    member,
    async ({ tx, where }) => ({
      org: (
        await tx
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, member.organizationId))
      )[0],
      list: await tx
        .select({
          id: buildings.id,
          name: buildings.name,
          city: buildings.city,
        })
        .from(buildings)
        .where(where(buildings))
        .orderBy(asc(buildings.name)),
    }),
  );
  if (!org) return null;
  const editable = can(member.role, "manage_settings");

  return (
    <div className="flex flex-col gap-10">
      {!editable && (
        <p className="text-sm text-muted-foreground">
          Ask an owner to change billing rules.
        </p>
      )}
      {editable && (
        <SimpleForm
          action={saveBillingRules.bind(null, null)}
          fields={billingRuleFields(
            shownKeys("organization", keysForScope),
            parseStoredSettings("organization", org.settings),
          )}
          submitLabel="Save billing rules"
          pendingLabel="Saving…"
        />
      )}

      <section aria-labelledby="buildings-heading" className="max-w-2xl">
        <h2 id="buildings-heading" className="mb-1 text-lg font-semibold">
          Building defaults
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          GST rate, SAC code, payment terms and billing timing for each
          building.
        </p>
        {list.length === 0 ? (
          <p className="text-sm">
            No buildings yet.{" "}
            <Link href="/leases/buildings" className="underline">
              Add your first building
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {list.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/settings/billing-rules/buildings/${b.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {b.city}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
