import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { ApplyCreditForm } from "@/components/payments/ApplyCreditForm";
import { PaymentList } from "@/components/payments/PaymentList";
import { PageHeader } from "@/components/shell/PageHeader";
import { contactFields } from "@/components/tenants/fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatINR } from "@/lib/format";
import { GST_STATES } from "@/lib/india/identifiers";
import {
  paymentSettings,
  paymentsFor,
  paymentsWithCredit,
  unpaidInvoices,
} from "@/lib/payments/payments";
import { toFieldValue } from "@/lib/settings/rules-form";
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
    const [payments, credits, unpaid] = await Promise.all([
      paymentsFor(s, id),
      paymentsWithCredit(s, id),
      unpaidInvoices(s, id, settings),
    ]);
    return { ...found, payments, credits, unpaid };
  });
  if (!data) notFound();
  const { tenant: t, contacts, payments, credits, unpaid } = data;
  const editable = can(member.role, "manage_tenants");
  const canBill = can(member.role, "manage_billing");
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
          description={`${t.billingAddress}, ${GST_STATES[t.stateCode] ?? t.stateCode}`}
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
        <Card>
          <p className="text-sm">
            No leases yet. Leases and unpaid invoices will show here.
          </p>
        </Card>
      </section>

      <section aria-labelledby="payments-heading" className="max-w-2xl">
        <h2 id="payments-heading" className="mb-2 text-lg font-semibold">
          Payments
        </h2>
        <p className="mb-3 text-sm">
          {owed > 0
            ? `${formatINR(owed)} unpaid on ${unpaid.length} ${unpaid.length === 1 ? "invoice" : "invoices"}.`
            : "Nothing unpaid."}
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
          <Card>
            <p className="text-sm">No payments recorded yet.</p>
          </Card>
        ) : (
          <PaymentList payments={payments} />
        )}
      </section>

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
                    {c.isPrimary && (
                      <Badge tone="good">Receives invoices</Badge>
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
          <>
            <h3 className="mb-2 font-medium">Add a contact</h3>
            <SimpleForm
              action={addContact.bind(null, t.id)}
              fields={contactFields()}
              submitLabel="Add contact"
              pendingLabel="Adding…"
              secondary
            />
          </>
        )}
      </section>
    </div>
  );
}
