import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Create an account
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter a lease once and it bills correctly every month.
      </p>
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        pendingLabel="Creating your account…"
        fields={[
          {
            name: "organizationName",
            label: "Company or building name",
            autoComplete: "organization",
            hint: "As your tenants know you. You can add the legal name and GSTIN later.",
          },
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
            autoComplete: "new-password",
            hint: "At least 8 characters.",
          },
        ]}
      />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Log in
        </Link>
      </p>
    </>
  );
}
