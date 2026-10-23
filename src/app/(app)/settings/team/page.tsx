import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { InviteForm } from "@/components/settings/InviteForm";
import { Badge, Card } from "@/components/ui/field";
import { appDb, requireMember } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { memberships } from "@/lib/db/schema";
import { runScoped } from "@/lib/db/scoped";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team"
        description="See who can use your account, and invite people."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading your team…</p>
        }
      >
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const member = await requireMember();
  const people = await runScoped(appDb, member, ({ tx, where }) =>
    tx
      .select()
      .from(memberships)
      .where(where(memberships))
      .orderBy(asc(memberships.createdAt)),
  );
  const visible = people.filter((p) => p.status !== "removed");

  return (
    <div className="flex flex-col gap-8">
      {member.role === "owner" ? (
        <section aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="mb-3 text-lg font-semibold">
            Invite someone
          </h2>
          <InviteForm />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ask an owner to invite people.
        </p>
      )}

      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="mb-3 text-lg font-semibold">
          People ({visible.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {visible.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.email}
                    {p.userId === member.userId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_LABELS[p.role].label}:{" "}
                    {ROLE_LABELS[p.role].description}
                  </p>
                </div>
                {p.status === "invited" && (
                  <Badge tone="warn">Invite not accepted yet</Badge>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
