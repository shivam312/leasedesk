import type { Metadata } from "next";
import { RecordActivity } from "@/components/activity/ActivitySection";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { EndLeaseForm } from "@/components/leases/EndLeaseForm";
import { ScheduleTable } from "@/components/leases/LeaseForm";
import { LEASE_STATUS } from "@/components/leases/status";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { monthOf } from "@/lib/billing/dates";
import { runScoped } from "@/lib/db/scoped";
import { documentsFor } from "@/lib/files/documents";
import { DEPOSIT_KIND_WORDS, DEPOSIT_KINDS } from "@/lib/payments/deposit-form";
import { depositLedger } from "@/lib/payments/deposits";
import { recordDepositEntryAction } from "@/server/actions/payments";
import { formatArea, formatDate, formatINR } from "@/lib/format";
import { bpText } from "@/lib/leases/prefill";
import { getLease } from "@/lib/leases/queries";
import { chargeSummary, reviewRows } from "@/lib/leases/review";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { todayInIndia } from "@/lib/today";
import { terminateLease } from "@/server/actions/leases";
import { addCustomDateAction } from "@/server/actions/alerts";
import { SimpleForm } from "@/components/forms/SimpleForm";

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
    return {
      saved,
      rows: reviewRows(saved.input, billingSettings(settings)),
      docs: await documentsFor(s, "lease", id),
      deposit: await depositLedger(s, id),
    };
  });
  if (!data) notFound();
  const { saved, rows, docs, deposit } = data;
  const canBill = can(member.role, "manage_billing");
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
            {deposit.entries.length > 0 &&
              ` agreed · ${formatINR(deposit.heldPaise)} held`}
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
                {d.status === "in_discussion" && (
                  <Badge tone="warn">In discussion</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <details className="mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium md:min-h-0">
              Add a date
            </summary>
            <div className="pt-3">
              <SimpleForm
                action={addCustomDateAction.bind(null, lease.id)}
                fields={[
                  {
                    name: "label",
                    label: "What the date is",
                    required: true,
                    hint: "Like “Rent review” or “Insurance renewal”.",
                  },
                  { name: "date", label: "Date", type: "date", required: true },
                  {
                    name: "remind",
                    label: "Remind me, days before",
                    inputMode: "numeric",
                    hint: "Shown on Today this many days before. Blank means 30 and 7.",
                  },
                ]}
                submitLabel="Add date"
                pendingLabel="Adding…"
                secondary
              />
            </div>
          </details>
        )}
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

      <DocumentsSection
        ownerType="lease"
        ownerId={lease.id}
        list={docs}
        canUpload={editable}
        empty={
          editable
            ? "No documents yet. Upload the signed agreement so it's here when you need it."
            : "No documents yet."
        }
      />

      <section aria-labelledby="deposit-heading" className="max-w-2xl">
        <h2 id="deposit-heading" className="mb-2 text-lg font-semibold">
          Security deposit
        </h2>
        <p className="mb-2 text-sm">
          {lease.depositAmount > 0
            ? `The lease agrees ${formatINR(lease.depositAmount)}. `
            : ""}
          Held now: {formatINR(deposit.heldPaise)}.{" "}
          {deposit.entries.length === 0 &&
            "Record the deposit when it's received, so it's here at the tenant's exit."}
        </p>
        {deposit.entries.length > 0 && (
          <ul className="mb-3 flex flex-col divide-y rounded-lg border text-sm">
            {deposit.entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2">
                <span className="flex justify-between gap-3">
                  <span>{DEPOSIT_KIND_WORDS[e.kind]}</span>
                  <span className="shrink-0 tabular-nums">
                    {e.kind === "received" ? "" : "− "}
                    {formatINR(e.amount)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {formatDate(e.date)}
                  {e.reference ? ` · ${e.reference}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                  {e.paymentId && (
                    <>
                      {" · "}
                      <Link
                        href={`/billing/payments/${e.paymentId}`}
                        className="underline"
                      >
                        the payment it made
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {deposit.entries.some(
          (e) => e.kind === "adjusted" || e.kind === "forfeited",
        ) && (
          <p className="mb-3 text-sm text-muted-foreground">
            Ask your accountant whether GST applies on the amount used for
            unpaid rent or kept.
          </p>
        )}
        <p className="mb-3 text-sm">
          <a
            href={`/leases/${lease.id}/settlement`}
            download
            className="inline-flex min-h-11 items-center underline md:min-h-0"
          >
            Download the deposit settlement statement (PDF)
          </a>
          : unpaid dues after TDS, less the deposit held, and the refund due.
        </p>
        {canBill && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium md:min-h-0">
              Record a deposit entry
            </summary>
            <div className="pt-3">
              <p className="mb-3 text-sm text-muted-foreground">
                An entry can&apos;t be edited or deleted afterwards. Check the
                amount and date first.
              </p>
              <SimpleForm
                action={recordDepositEntryAction.bind(null, lease.id)}
                fields={[
                  {
                    name: "kind",
                    label: "What happened",
                    type: "select",
                    required: true,
                    defaultValue: "received",
                    options: Object.entries(DEPOSIT_KINDS).map(
                      ([value, label]) => ({ value, label }),
                    ),
                    hint: "Unpaid rent stays on the tenant's invoices; settle it with a payment, and refund the rest of the deposit.",
                  },
                  {
                    name: "date",
                    label: "Date received or paid out",
                    type: "date",
                    required: true,
                  },
                  {
                    name: "amount",
                    label: "Amount (₹)",
                    required: true,
                    inputMode: "decimal",
                  },
                  {
                    name: "reference",
                    label: "Reference (UTR, cheque number)",
                  },
                  { name: "note", label: "Note" },
                ]}
                submitLabel="Record entry"
                pendingLabel="Recording…"
                secondary
              />
            </div>
          </details>
        )}
      </section>

      <RecordActivity ids={[lease.id]} />

      <section aria-labelledby="schedule-heading" className="max-w-2xl">
        <h2 id="schedule-heading" className="mb-2 text-lg font-semibold">
          Rent schedule
        </h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Before GST, in the month each amount is billed.
        </p>
        <ScheduleTable rows={rows} fromMonth={monthOf(todayInIndia())} />
      </section>
    </div>
  );
}
