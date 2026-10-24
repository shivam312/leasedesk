import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleLogin } from "@/components/auth/GoogleLogin";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { FormMessage } from "@/components/ui/field";
import { logIn } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <Suspense>
        <GoogleFailedNote searchParams={searchParams} />
      </Suspense>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Log in to see what needs doing today.
      </p>
      <AuthForm
        autoFocus
        action={logIn}
        submitLabel="Log in"
        pendingLabel="Logging in…"
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
      <Suspense fallback={null}>
        <GoogleLogin label="Log in with Google" />
      </Suspense>
      <p className="mt-4 text-center text-sm">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center text-muted-foreground underline md:min-h-0"
        >
          Forgot your password?
        </Link>
      </p>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center font-medium text-foreground underline md:min-h-0"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}

/** Google sent the person back without a session (/auth/callback). */
async function GoogleFailedNote({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { google } = await searchParams;
  if (google !== "failed") return null;
  return (
    <div className="mb-4">
      <FormMessage message="Google login didn't work. Try again, or log in with your email and password." />
    </div>
  );
}
