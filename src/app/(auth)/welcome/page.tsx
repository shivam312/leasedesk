import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { finishSetup, logOut } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Set up your account" };

// Reached when someone is logged in but has no organization yet, e.g. their
// sign-up was interrupted. The action checks who they are.
export default function WelcomePage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        One more step
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        What should we call your company or buildings?
      </p>
      <AuthForm
        action={finishSetup}
        submitLabel="Continue"
        pendingLabel="Setting up…"
        fields={[
          {
            name: "organizationName",
            label: "Company or building name",
            autoComplete: "organization",
          },
        ]}
      />
      <form action={logOut} className="mt-6 text-center">
        <button
          type="submit"
          className="text-sm text-muted-foreground underline"
        >
          Use a different account
        </button>
      </form>
    </>
  );
}
