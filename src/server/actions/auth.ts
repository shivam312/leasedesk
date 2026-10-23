"use server";

// Sign up, log in, log out, reset a forgotten password, and finish setting
// up an organization.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appDb, currentUser } from "@/lib/auth";
import {
  forgotPasswordSchema,
  logInSchema,
  newPasswordSchema,
  parseForm,
  signUpSchema,
  welcomeSchema,
  type FormState,
} from "@/lib/auth/forms";
import { createOrganizationForOwner, findMember } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { reportError } from "@/lib/monitoring";
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

/** The app's address for links in emails: APP_URL, else this request's host. */
async function appOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/**
 * Emails a link to choose a new password. The answer is the same whether or
 * not there's an account with this email, so the form can't be used to find
 * out who has one.
 */
export async function requestPasswordReset(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = parseForm(forgotPasswordSchema, form);
  if ("state" in parsed) return parsed.state;
  const { email } = parsed.data;

  const supabase = await createSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await appOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit") {
    return {
      message:
        "We've sent several emails already. Wait a few minutes, then try again.",
      values: { email },
    };
  }
  if (error) reportError("Password reset email failed", error);
  return {
    tone: "success",
    message: `If there's an account for ${email}, we've emailed it a link to choose a new password. The link works for an hour.`,
    values: { email },
  };
}

/** Sets a new password for the signed-in user (after following the emailed link). */
export async function setNewPassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/forgot-password");
  const parsed = parseForm(newPasswordSchema, form);
  if ("state" in parsed) return parsed.state;

  const supabase = await createSupabase();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      message:
        error.code === "same_password"
          ? "That's your current password. Choose a different one."
          : error.code === "weak_password"
            ? "Choose a longer password that's harder to guess."
            : "We couldn't change your password. Try again, or ask for a new link.",
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
