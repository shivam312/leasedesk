import type { Metadata } from "next";
import { RecordActivity } from "@/components/activity/ActivitySection";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { ApplyCreditForm } from "@/components/payments/ApplyCreditForm";
import { LEASE_STATUS } from "@/components/leases/status";
import { PaymentList } from "@/components/payments/PaymentList";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { InvoiceStatusBadge } from "@/components/invoices/StatusBadge";
import { contactFields } from "@/components/tenants/fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatDate, formatINR, formatMonth } from "@/lib/format";
import { documentsFor } from "@/lib/files/documents";
import { invoicesOfTenant } from "@/lib/invoices/queries";
import { todayInIndia } from "@/lib/today";
import { addressWithState } from "@/lib/india/address";
import { listLeases } from "@/lib/leases/queries";
import {
  paymentSettings,
  paymentsFor,
  paymentsWithCredit,
  unpaidInvoices,
} from "@/lib/payments/payments";
import { toFieldValue } from "@/lib/settings/rules-form";
import { receivesInvoices } from "@/lib/tenants/contacts";
import { CONTACT_ROLE_LABELS } from "@/lib/tenants/forms";
import { getTenant } from "@/lib/tenants/queries";
import { applyCreditAction } from "@/server/actions/payments";
import { addContact } from "@/server/actions/tenants";

export const metadata: Metadata = { title: "Tenant" };

export default function TenantPage({ params }: PageProps<"/tenants/[id]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading the tenant…</p>
      }
    >
      <Tenant params={params} />
    </Suspense>
  );
}

function tdsLine(on: boolean, bp: number, what: string) {
  return on
    ? `${toFieldValue("gst.defaultRateBp", bp)}% on ${what}`
    : `None on ${what}`;
}

async function Tenant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => {
    const found = await getTenant(s, id);
    if (!found) return null;
    const settings = await paymentSettings(s, id);
    const [leases, payments, credits, unpaid, invoiceList] = await Promise.all([
      listLeases(s, id),
      paymentsFor(s, id),
      paymentsWithCredit(s, id),
      unpaidInvoices(s, id, settings),
      invoicesOfTenant(s, id),
    ]);
    const docs = await documentsFor(s, "tenant", id);
    return { ...found, leases, payments, credits, unpaid, invoiceList, docs };
  });
  if (!data) notFound();
  const { tenant: t, contacts, leases, payments, credits, unpaid } = data;
  const editable = can(member.role, "manage_tenants");
  const canBill = can(member.role, "manage_billing");
  const canLease = can(member.role, "manage_leases");
  const credit = credits.reduce((sum, c) => sum + c.creditPaise, 0);
  const owed = unpaid.reduce((sum, i) => sum + i.outstandingPaise, 0);
  const tds = [
    tdsLine(t.deductsTdsRent, t.tdsRateBpRent, "rent"),
    tdsLine(t.deductsTdsCam, t.tdsRateBpCam, "maintenance (CAM)"),
    tdsLine(t.deductsTdsParking, t.tdsRateBpParking, "parking"),
    tdsLine(t.deductsTdsOther, t.tdsRateBpOther, "other charges"),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          title={t.companyName}
          description={addressWithState(t.billingAddress, t.stateCode)}
        />
        {(editable || canBill) && (
          <div className="-mt-3 flex flex-wrap gap-2">
            {canBill && (
              <Link
                href={`/billing/payments/new?tenant=${t.id}`}
                className={buttonVariants({ className: "h-11 md:h-9" })}
              >
                Record payment
              </Link>
            )}
            {editable && (
              <Button asChild variant="outline" className="h-11 md:h-9">
                <Link href={`/tenants/${t.id}/edit`}>Edit tenant</Link>
              </Button>
            )}
          </div>
        )}
      </div>

      <dl className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">GSTIN</dt>
          <dd className="font-medium">{t.gstin ?? "Not registered for GST"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">PAN</dt>
          <dd className="font-medium">{t.pan ?? "Not added"}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-muted-foreground">TDS they deduct</dt>
          <dd className="font-medium">{tds.join(". ")}.</dd>
        </div>
        {t.notes && (
          <div className="md:col-span-2">
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-line">{t.notes}</dd>
          </div>
        )}
      </dl>

      <section aria-labelledby="leases-heading" className="max-w-2xl">
        <h2 id="leases-heading" className="mb-2 text-lg font-semibold">
          Leases
        </h2>
        {leases.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <p className="text-sm">No leases yet for {t.companyName}.</p>
            {canLease && (
              <Link
                href="/leases/new"
                className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
              >
                Add lease
              </Link>
            )}
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {leases.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leases/${l.id}`}
                  className="block rounded-md border p-3 hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {l.buildingName}
                    <Badge tone={LEASE_STATUS[l.status].tone}>
                      {LEASE_STATUS[l.status].label}
                    </Badge>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(l.startDate)} to {formatDate(l.endDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="invoices-heading" className="max-w-2xl">
        <h2 id="invoices-heading" className="mb-2 text-lg font-semibold">
          Invoices
        </h2>
        {data.invoiceList.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invoices yet. They appear here once the month&apos;s invoices are
            made on Billing.
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y rounded-lg border">
              {data.invoiceList.invoices.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/billing/invoices/${i.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium break-words">
                        {i.number ??
                          `Not sent yet (${formatMonth(i.periodStart.slice(0, 7))})`}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {formatDate(i.invoiceDate)} · due{" "}
                        {formatDate(i.dueDate)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular-nums">
                        {formatINR(i.grandTotal)}
                      </span>
                      <InvoiceStatusBadge invoice={i} today={todayInIndia()} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {data.invoiceList.more && (
              <p className="mt-2 text-sm">
                Showing the latest {data.invoiceList.invoices.length}.{" "}
                <Link
                  href={`/tenants/${t.id}/ledger`}
                  className="inline-flex min-h-11 items-center underline md:min-h-0"
                >
                  See every invoice on the ledger
                </Link>
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="payments-heading" className="max-w-2xl">
        <h2 id="payments-heading" className="mb-2 text-lg font-semibold">
          Payments
        </h2>
        <p className="mb-3 text-sm">
          {owed > 0
            ? `${formatINR(owed)} unpaid on ${unpaid.length} ${unpaid.length === 1 ? "invoice" : "invoices"}.`
            : "Nothing unpaid."}{" "}
          <Link
            href={`/tenants/${t.id}/ledger`}
            className="inline-flex min-h-11 items-center underline md:min-h-0"
          >
            See the ledger
          </Link>
        </p>
        {credit > 0 && (
          <Card className="mb-3 flex flex-col gap-2">
            <p className="text-sm">
              {formatINR(credit)} paid in advance is kept as credit.
              {unpaid.length > 0 && canBill
                ? " Apply it to their unpaid invoices, oldest first."
                : ""}
            </p>
            {unpaid.length > 0 && canBill && (
              <ApplyCreditForm
                tenantId={t.id}
                label={`Apply ${formatINR(Math.min(credit, owed))} credit`}
                action={applyCreditAction}
              />
            )}
          </Card>
        )}
        {payments.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <p className="text-sm">
              No payments yet. When {t.companyName} pays, record it so their
              invoices show as paid.
            </p>
            {canBill && (
              <Link
                href={`/billing/payments/new?tenant=${t.id}`}
                className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
              >
                Record payment
              </Link>
            )}
          </Card>
        ) : (
          <PaymentList payments={payments} />
        )}
      </section>

      <DocumentsSection
        ownerType="tenant"
        ownerId={t.id}
        list={data.docs}
        canUpload={editable}
        empty={
          <>
            No documents yet: the tenant&apos;s ID proof, insurance or other
            papers go here. TDS certificates are under{" "}
            <Link href="/billing/tds" className="underline">
              Billing → TDS certificates
            </Link>
            .
          </>
        }
      />

      <RecordActivity ids={[t.id, ...contacts.map((c) => c.id)]} />

      <section aria-labelledby="contacts-heading" className="max-w-2xl">
        <h2 id="contacts-heading" className="mb-2 text-lg font-semibold">
          Contacts ({contacts.length})
        </h2>
        {contacts.length === 0 ? (
          <Card className="mb-4">
            <p className="text-sm">
              No contacts yet.
              {editable && " Add the person who receives invoices below."}
            </p>
          </Card>
        ) : (
          <ul className="mb-6 flex flex-col gap-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {c.name}
                    <Badge>{CONTACT_ROLE_LABELS[c.role]}</Badge>
                    {receivesInvoices(c, contacts) && (
                      <Badge tone="good">Receives invoices</Badge>
                    )}
                    {editable && (
                      <Link
                        href={`/tenants/${t.id}/contacts/${c.id}`}
                        className="ml-auto inline-flex min-h-11 items-center text-sm font-normal underline md:min-h-0"
                        aria-label={`Edit ${c.name}`}
                      >
                        Edit
                      </Link>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      c.email,
                      c.phone && `${c.phone}${c.whatsapp ? " (WhatsApp)" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <details className="group">
            <summary
              className={buttonVariants({
                variant: "outline",
                className: "h-11 cursor-pointer list-none md:h-9",
              })}
            >
              Add a contact
            </summary>
            <div className="pt-4">
              <SimpleForm
                action={addContact.bind(null, t.id)}
                fields={contactFields()}
                submitLabel="Add contact"
                pendingLabel="Adding…"
                secondary
              />
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
