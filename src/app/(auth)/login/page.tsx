import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { logIn } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
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
        <Link href="/signup" className="font-medium text-foreground underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
