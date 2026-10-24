import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { organizationFields } from "@/components/settings/business";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { billingEntities, organizations } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";
import { EMAIL_NOT_SET_UP, emailFrom, emailMode } from "@/lib/email";
import { GST_STATES } from "@/lib/india/identifiers";
import { saveOrganization } from "@/server/actions/business";

export const metadata: Metadata = { title: "Business details" };

export default function BusinessPage() {
  return (
    <>
      <PageHeader
        title="Business details"
        description="Your business name, and the GSTINs and bank accounts printed on invoices."
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Business />
      </Suspense>
    </>
  );
}

async function Business() {
  const member = await requireMember();
  const { org, entities } = await runScoped(
    appDb,
    member,
    async ({ tx, where }) => ({
      org: (
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, member.organizationId))
      )[0],
      entities: await tx
        .select()
        .from(billingEntities)
        .where(where(billingEntities))
        .orderBy(asc(billingEntities.createdAt)),
    }),
  );
  if (!org) return null;
  const editable = can(member.role, "manage_settings");
  const email = emailMode();

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="email-heading" className="max-w-2xl">
        <h2 id="email-heading" className="mb-3 text-lg font-semibold">
          Email
        </h2>
        <Card className="flex flex-col gap-2">
          {email === "not_set_up" ? (
            <>
              <div>
                <Badge tone="bad">Not set up</Badge>
              </div>
              <p className="text-sm">{EMAIL_NOT_SET_UP}</p>
              <p className="text-sm text-muted-foreground">
                Whoever runs your LeaseDesk server adds the email account
                (RESEND_API_KEY and EMAIL_FROM). Reminders and the daily summary
                wait for it too.
              </p>
            </>
          ) : email === "resend" ? (
            <p className="text-sm">
              Invoices, credit notes and reminders are emailed from{" "}
              {emailFrom()}.
            </p>
          ) : (
            <>
              <div>
                <Badge tone="warn">Test mode</Badge>
              </div>
              <p className="text-sm">
                Emails are saved on this computer (in .local-outbox), not sent
                to tenants. This is for trying LeaseDesk out.
              </p>
            </>
          )}
        </Card>
      </section>

      {editable ? (
        <SimpleForm
          action={saveOrganization}
          fields={organizationFields(org)}
          submitLabel="Save details"
          pendingLabel="Saving…"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {org.name}. Ask an owner to change your business details.
        </p>
      )}

      <section aria-labelledby="entities-heading" className="max-w-2xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="entities-heading" className="text-lg font-semibold">
            GSTINs and bank accounts
          </h2>
          {editable && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-0"
            >
              <Link href="/settings/business/entities/new">Add a GSTIN</Link>
            </Button>
          )}
        </div>
        {entities.length === 0 ? (
          <Card>
            <p className="text-sm">
              No GSTIN yet. Add the one your invoices are issued from; each
              building bills from one.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {entities.map((e) => (
              <li key={e.id}>
                <Card className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.legalName}</p>
                    <p className="text-sm text-muted-foreground">
                      {e.gstin ?? "Not registered for GST"} ·{" "}
                      {GST_STATES[e.stateCode] ?? e.stateCode}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!e.bankAccountNumber && !e.upiId && (
                      <Badge tone="warn">No bank or UPI yet</Badge>
                    )}
                    {editable && (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="min-h-11 md:min-h-0"
                      >
                        <Link
                          href={`/settings/business/entities/${e.id}`}
                          aria-label={`Edit ${e.legalName}`}
                        >
                          Edit
                        </Link>
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
