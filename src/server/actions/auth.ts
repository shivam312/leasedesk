"use server";

// Sign up, log in, log out, reset a forgotten password, and finish setting
// up an organization.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { googleLoginEnabled } from "@/lib/auth/providers";
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
import { emailLinkOrigin } from "@/lib/auth/origin";
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

  const origin = emailLinkOrigin({
    appUrl: process.env.APP_URL,
    host: (await headers()).get("host"),
  });
  if (!origin) {
    // Deployed without APP_URL: no address we trust to put in the link.
    reportError(
      "Password reset email not sent: APP_URL is not set",
      new Error("APP_URL missing"),
    );
    return {
      message:
        "We can't send reset emails yet. Ask the person who set up LeaseDesk for your account to reset your password.",
      values: { email },
    };
  }

  const supabase = await createSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
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
    message: `If ${email} has an account, we've emailed it a link to choose a new password. Check your inbox and spam folder; the link works for an hour.`,
    values: { email },
  };
}

/** Sets a new password for the signed-in user (after following the emailed link). */
export async function setNewPassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await currentUser();
  // The session ended while the page was open: say so, not just bounce.
  if (!user) redirect("/forgot-password?expired=1");
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

/** "Log in with Google": off to Google, back through /auth/callback. */
export async function logInWithGoogle(): Promise<void> {
  const origin = emailLinkOrigin({
    appUrl: process.env.APP_URL,
    host: (await headers()).get("host"),
  });
  if (!origin || !(await googleLoginEnabled())) redirect("/login");
  const supabase = await createSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=/today` },
  });
  if (error || !data.url) {
    reportError("Google login failed to start", error ?? new Error("no url"));
    redirect("/login");
  }
  redirect(data.url);
}
