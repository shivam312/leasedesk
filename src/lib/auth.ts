// The signed-in user, for server components and server actions. Every data
// read and every action starts here; the proxy's redirect is only a shortcut.

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Transactional } from "@/lib/db/scoped";
import { createSupabase } from "@/lib/supabase/server";
import { findMember, type Member } from "./auth/membership";

export type { Member, Role } from "./auth/membership";

/** The signed-in Supabase user, or null. */
export async function currentUser() {
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user's organization and role. Signed out → login page;
 * signed in without an organization (sign-up didn't finish) → /welcome.
 */
export async function requireMember(): Promise<Member> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const member = await findMember(db, user.id);
  if (!member) redirect("/welcome");
  return member;
}

/** The database, typed for withOrg-style callers in server code. */
export const appDb = db as unknown as Transactional;
