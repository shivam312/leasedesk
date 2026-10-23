"use server";

// Inviting people to the team, and accepting an invite.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appDb, currentUser, requireMember } from "@/lib/auth";
import { parseForm, type FormState } from "@/lib/auth/forms";
import {
  acceptInvite,
  findInvite,
  InviteError,
  inviteMember,
} from "@/lib/auth/invites";
import { PermissionError, requirePermission, ROLES } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { createSupabase } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address, like name@company.com.")),
  role: z.enum(ROLES as [string, ...string[]], "Choose what they can do."),
});

export interface InviteState extends FormState {
  link?: string;
  invitedEmail?: string;
}

export async function invite(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  const member = await requireMember();
  try {
    requirePermission(member, "manage_team");
  } catch (error) {
    if (error instanceof PermissionError) return { message: error.message };
    throw error;
  }
  const parsed = parseForm(inviteSchema, form);
  if ("state" in parsed) return parsed.state;
  const { email, role } = parsed.data;
  try {
    const { token } = await runScoped(appDb, member, (s) =>
      inviteMember(s, { email, role: role as (typeof ROLES)[number] }),
    );
    revalidatePath("/settings/team");
    return { link: `/invite/${token}`, invitedEmail: email };
  } catch (error) {
    if (error instanceof InviteError)
      return { message: error.message, values: { email, role } };
    throw error;
  }
}

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Use at least 8 characters for your password.")
    .max(72, "Use at most 72 characters for your password."),
});

/**
 * Join through an invite link. New people choose a password; someone who
 * already has a login with the invited email enters their current one.
 */
export async function joinTeam(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = parseForm(acceptSchema, form);
  if ("state" in parsed) return parsed.state;
  const { token, password } = parsed.data;

  const open = await findInvite(appDb, token);
  if (!open) {
    return {
      message:
        "This invite link has already been used or was cancelled. Ask for a new one.",
    };
  }

  const supabase = await createSupabase();
  let user = await currentUser();
  if (!user || user.email?.toLowerCase() !== open.email) {
    const signUp = await supabase.auth.signUp({ email: open.email, password });
    if (signUp.data.session && signUp.data.user) {
      user = signUp.data.user;
    } else {
      const logIn = await supabase.auth.signInWithPassword({
        email: open.email,
        password,
      });
      if (logIn.error || !logIn.data.user) {
        return {
          message: `There's already a login for ${open.email} with a different password. Enter that password, or ask for help to reset it.`,
        };
      }
      user = logIn.data.user;
    }
  }

  try {
    await acceptInvite(appDb, {
      token,
      userId: user.id,
      email: user.email ?? "",
    });
  } catch (error) {
    if (error instanceof InviteError) return { message: error.message };
    throw error;
  }
  redirect("/today");
}
