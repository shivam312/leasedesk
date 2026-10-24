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
import { addMonthsToMonth, monthOf, startOfMonth } from "@/lib/billing/dates";
import { formatDate } from "@/lib/format";
import { reminderPreview } from "@/lib/reminders/preview";
import { resolveSettings } from "@/lib/settings/resolve";
import { todayInIndia } from "@/lib/today";

export const metadata: Metadata = { title: "Billing rules" };

export default function BillingRulesPage() {
  return (
    <>
      <Link
        href="/settings"
        className="mb-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline md:min-h-0"
      >
        ← Settings
      </Link>
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
          .select({
            settings: organizations.settings,
            name: organizations.name,
          })
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
  const rules = resolveSettings({ organization: org.settings });
  const preview = reminderPreview({
    beforeDueDays: rules["reminders.beforeDueDays"],
    afterDueDays: rules["reminders.afterDueDays"],
    invoiceDate: startOfMonth(addMonthsToMonth(monthOf(todayInIndia()), 1)),
    dueDays: rules["invoice.dueDays"],
    businessName: org.name,
  });

  return (
    <div className="flex flex-col gap-10">
      {!editable && (
        <p className="text-sm text-muted-foreground">
          Ask an owner to change billing rules.
        </p>
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

      <section aria-labelledby="reminders-heading" className="max-w-2xl">
        <h2 id="reminders-heading" className="mb-1 text-lg font-semibold">
          What payment reminders send
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {rules["reminders.autoSend"]
            ? "Automatic reminders are on. For an unpaid invoice dated"
            : "Automatic reminders are off. If you turn them on below, for an unpaid invoice dated"}{" "}
          {formatDate(
            startOfMonth(addMonthsToMonth(monthOf(todayInIndia()), 1)),
          )}{" "}
          and due {rules["invoice.dueDays"]}{" "}
          {rules["invoice.dueDays"] === 1 ? "day" : "days"} later, the
          tenant&apos;s accounts contact gets:
        </p>
        {preview.timeline.length === 0 ? (
          <p className="text-sm">
            No reminders: no reminder days are set below.
          </p>
        ) : (
          <>
            <ul className="mb-3 flex flex-col divide-y rounded-lg border text-sm">
              {preview.timeline.map((t) => (
                <li key={t.date} className="flex flex-col gap-1 px-4 py-3">
                  <span className="font-medium tabular-nums">
                    {formatDate(t.date)} · {t.when}
                  </span>
                  <span className="break-words text-muted-foreground">
                    {t.subject}
                  </span>
                </li>
              ))}
            </ul>
            {preview.sample && (
              <details className="rounded-lg border px-4 py-3 text-sm">
                <summary className="min-h-11 cursor-pointer py-2 font-medium md:min-h-0">
                  See the email: {preview.sample.subject}
                </summary>
                <pre className="mt-2 font-sans break-words whitespace-pre-wrap">
                  {preview.sample.text}
                </pre>
              </details>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              It asks for what&apos;s left to pay after the TDS the tenant may
              keep back, and stops once the invoice is paid. A tenant can be
              left out on their own page.
            </p>
          </>
        )}
      </section>
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
    </div>
  );
}
