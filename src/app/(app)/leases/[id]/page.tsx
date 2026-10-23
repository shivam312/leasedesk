import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EndLeaseForm } from "@/components/leases/EndLeaseForm";
import { ScheduleTable } from "@/components/leases/LeaseForm";
import { LEASE_STATUS } from "@/components/leases/status";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatArea, formatDate, formatINR } from "@/lib/format";
import { bpText } from "@/lib/leases/prefill";
import { getLease } from "@/lib/leases/queries";
import { chargeSummary, reviewRows } from "@/lib/leases/review";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { terminateLease } from "@/server/actions/leases";

const monthsText = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

export const metadata: Metadata = { title: "Lease" };

const CHARGE_NAMES = {
  rent: "Rent",
  cam: "Maintenance (CAM)",
  parking: "Parking",
  utilities: "Utilities",
  signage: "Signage",
  other: "Other",
};

const DATE_NAMES = {
  expiry: "Lease ends",
  lock_in_end: "Lock-in ends",
  escalation: "Rent increase",
  renewal_option: "Renewal option",
  notice_deadline: "Last day to give notice",
  custom: "Reminder",
};

export default function LeasePage({ params }: PageProps<"/leases/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the lease…</p>
      }
    >
      <Lease params={params} />
    </Suspense>
  );
}

async function Lease({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => {
    const saved = await getLease(s, id);
    if (!saved) return null;
    const settings = await loadSettings(s, {
      buildingId: saved.lease.buildingId,
      tenantId: saved.lease.tenantId,
      leaseSettings: saved.lease.settings,
    });
    return { saved, rows: reviewRows(saved.input, billingSettings(settings)) };
  });
  if (!data) notFound();
  const { saved, rows } = data;
  const { lease } = saved;
  const editable = can(member.role, "manage_leases");
  const status = LEASE_STATUS[lease.status];
  const canEnd = lease.status === "active" || lease.status === "in_notice";
  const canRenew = canEnd || lease.status === "expired";
  const area = saved.units.reduce((sum, u) => sum + u.area, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          title={saved.tenantName}
          description={`${saved.buildingName} · ${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}${lease.version > 1 ? ` · Version ${lease.version}` : ""}`}
        />
        <div className="-mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {editable && canRenew && (
            <Button asChild className="h-11 md:h-9">
              <Link href={`/leases/new?renew=${lease.id}`}>Renew</Link>
            </Button>
          )}
          {editable && (
            <Button asChild variant="ghost" className="h-11 md:h-9">
              <Link href={`/leases/new?copy=${lease.id}`}>
                Copy to a new lease
              </Link>
            </Button>
          )}
        </div>
      </div>

      <dl className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Rent starts on</dt>
          <dd className="font-medium">
            {formatDate(lease.rentCommencementDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Units</dt>
          <dd className="font-medium">
            {saved.units.map((u) => u.code).join(", ")} ({formatArea(area)}{" "}
            {lease.areaBasis === "carpet" ? "carpet" : "billed"} area)
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            Lock-in (can&apos;t leave before)
          </dt>
          <dd className="font-medium">
            {lease.lockInEndDate ? formatDate(lease.lockInEndDate) : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Notice period</dt>
          <dd className="font-medium">
            {lease.noticePeriodMonths
              ? monthsText(lease.noticePeriodMonths)
              : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Security deposit</dt>
          <dd className="font-medium">
            {lease.depositAmount > 0 ? formatINR(lease.depositAmount) : "None"}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="charges-heading" className="max-w-2xl">
        <h2 id="charges-heading" className="mb-2 text-lg font-semibold">
          Rent and charges
        </h2>
        <ul className="flex flex-col gap-2">
          {saved.input.charges.map((c) => {
            const summary = chargeSummary(c);
            return (
              <li key={c.id}>
                <Card className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-4">
                    <p className="font-medium">
                      {c.label ?? CHARGE_NAMES[c.type] ?? "Charge"}
                    </p>
                    <p className="font-medium tabular-nums">{summary.amount}</p>
                  </div>
                  {summary.how && (
                    <p className="text-muted-foreground">{summary.how}</p>
                  )}
                  <p className="text-muted-foreground">
                    {c.timing === "advance"
                      ? "Billed in advance"
                      : "Billed after the month"}
                    {" · "}GST {bpText(c.gstRateBp)}%
                    {c.endDate && ` · Ends ${formatDate(c.endDate)}`}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
        {saved.rules.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {saved.rules.map((r) => (
              <li key={r.id}>
                Rent goes up {bpText(r.percentBp)}% every{" "}
                {r.everyMonths === 1 ? "month" : monthsText(r.everyMonths)}
                {r.compounding ? "" : ", each time on the starting rent"}.
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dates-heading" className="max-w-2xl">
        <h2 id="dates-heading" className="mb-2 text-lg font-semibold">
          Key dates
        </h2>
        {saved.criticalDates.length === 0 ? (
          <p className="text-sm">No key dates.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {saved.criticalDates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                {d.label ?? DATE_NAMES[d.type]}: {formatDate(d.date)}
                {d.status === "done" && <Badge>Done</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="schedule-heading" className="max-w-2xl">
        <h2 id="schedule-heading" className="mb-2 text-lg font-semibold">
          Rent schedule
        </h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Before GST, in the month each amount is billed.
        </p>
        <ScheduleTable rows={rows} />
      </section>

      {editable && canEnd && (
        <details className="max-w-2xl">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            End this lease early
          </summary>
          <div className="pt-2">
            <EndLeaseForm
              tenantName={saved.tenantName}
              action={terminateLease.bind(null, lease.id)}
            />
          </div>
        </details>
      )}
    </div>
  );
}
