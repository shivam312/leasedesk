import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { JoinForm } from "@/components/settings/JoinForm";
import { appDb } from "@/lib/auth";
import { findInvite } from "@/lib/auth/invites";
import { ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Join your team" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Opening your invite…</p>
      }
    >
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInvite(appDb, token);
  if (!invite) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          This invite link doesn&apos;t work any more
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          It may have been used already. Ask the owner for a new link.
        </p>
        <Link href="/login" className="text-sm font-medium underline">
          Log in instead
        </Link>
      </>
    );
  }
  const role = ROLE_LABELS[invite.role];
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Join {invite.organizationName}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        You&apos;re invited as <strong>{role.label}</strong>:{" "}
        {role.description.toLowerCase()}.
      </p>
      <JoinForm token={token} email={invite.email} />
    </>
  );
}
