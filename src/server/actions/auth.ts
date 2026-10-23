"use server";

// Sign up, log in, log out, and finish setting up an organization.

import { redirect } from "next/navigation";
import { appDb, currentUser } from "@/lib/auth";
import {
  logInSchema,
  parseForm,
  signUpSchema,
  welcomeSchema,
  type FormState,
} from "@/lib/auth/forms";
import { createOrganizationForOwner, findMember } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { createSupabase } from "@/lib/supabase/server";

export async function signUp(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = parseForm(signUpSchema, form);
  if ("state" in parsed) return parsed.state;
  const { organizationName, email, password } = parsed.data;

  const supabase = await createSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return {
      message:
        error?.code === "user_already_exists"
          ? "There's already an account with this email. Log in instead."
          : "We couldn't create your account. Check your details and try again.",
      values: { organizationName, email },
    };
  }
  if (!data.session) {
    // Email confirmation is on for this project: the user confirms, then logs in.
    return {
      tone: "success",
      message: `Check your email. We sent a link to ${email}. Open it to confirm, then log in.`,
      values: { organizationName, email },
    };
  }
  await createOrganizationForOwner(appDb, {
    userId: data.user.id,
    email,
    organizationName,
  });
  redirect("/today");
}

export async function logIn(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = parseForm(logInSchema, form);
  if ("state" in parsed) return parsed.state;
  const { email, password } = parsed.data;

  const supabase = await createSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      message:
        error.code === "email_not_confirmed"
          ? "Confirm your email first. We sent you a link when you signed up."
          : "That email and password don't match. Try again.",
      values: { email },
    };
  }
  redirect("/today");
}

export async function logOut(): Promise<void> {
  const supabase = await createSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/** For a signed-in user whose sign-up stopped before their organization was created. */
export async function finishSetup(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user?.email) redirect("/login");
  if (await findMember(db, user.id)) redirect("/today");

  const parsed = parseForm(welcomeSchema, form);
  if ("state" in parsed) return parsed.state;
  await createOrganizationForOwner(appDb, {
    userId: user.id,
    email: user.email,
    organizationName: parsed.data.organizationName,
  });
  redirect("/today");
}
