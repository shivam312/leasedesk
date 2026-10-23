import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { requestPasswordReset } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Forgot your password" };

export default function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  return (
    <>
      <Suspense>
        <ExpiredNote searchParams={searchParams} />
      </Suspense>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Forgot your password?
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter the email you log in with. We&apos;ll email you a link to choose a
        new password.
      </p>
      <AuthForm
        autoFocus
        action={requestPasswordReset}
        submitLabel="Email me a link"
        pendingLabel="Sending…"
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
          },
        ]}
      />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center font-medium text-foreground underline md:min-h-0"
        >
          Log in
        </Link>
      </p>
    </>
  );
}

async function ExpiredNote({
  searchParams,
}: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const { expired } = await searchParams;
  if (!expired) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border px-3 py-2 text-sm">
      That link has expired or was already used. Ask for a new one below.
    </p>
  );
}
