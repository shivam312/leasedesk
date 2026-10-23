import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { contactFields } from "@/components/tenants/fields";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { GST_STATES } from "@/lib/india/identifiers";
import { toFieldValue } from "@/lib/settings/rules-form";
import { CONTACT_ROLE_LABELS } from "@/lib/tenants/forms";
import { getTenant } from "@/lib/tenants/queries";
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
    : `none on ${what}`;
}

async function Tenant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const data = await runScoped(appDb, member, (s) => getTenant(s, id));
  if (!data) notFound();
  const { tenant: t, contacts } = data;
  const editable = can(member.role, "manage_tenants");
  const tds = [
    tdsLine(t.deductsTdsRent, t.tdsRateBpRent, "rent"),
    tdsLine(t.deductsTdsCam, t.tdsRateBpCam, "CAM"),
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
        {editable && (
          <div className="-mt-3">
            <Button asChild variant="outline">
              <Link href={`/tenants/${t.id}/edit`}>Edit tenant</Link>
            </Button>
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
          <dd className="font-medium">{tds.join(", ")}</dd>
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

      <section aria-labelledby="contacts-heading" className="max-w-2xl">
        <h2 id="contacts-heading" className="mb-2 text-lg font-semibold">
          Contacts ({contacts.length})
        </h2>
        {contacts.length === 0 ? (
          <Card className="mb-4">
            <p className="text-sm">
              No contacts yet. Add the person who receives invoices.
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
