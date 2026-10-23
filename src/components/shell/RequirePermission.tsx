import { Suspense } from "react";
import { requireMember } from "@/lib/auth";
import { can, type Permission } from "@/lib/auth/roles";
import { NoAccess } from "./NoAccess";

/** Show `children` (a form) only to people who may use it; others get NoAccess. */
export function RequirePermission(props: {
  permission: Permission;
  message: string;
  back: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <Check {...props} />
    </Suspense>
  );
}

async function Check({
  permission,
  message,
  back,
  children,
}: Parameters<typeof RequirePermission>[0]) {
  const member = await requireMember();
  if (!can(member.role, permission))
    return <NoAccess message={message} back={back} />;
  return children;
}
