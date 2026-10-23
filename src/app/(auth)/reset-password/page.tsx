import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { setNewPassword } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Choose a new password" };

// Reached from the emailed reset link (signed in by /auth/confirm), or by a
// signed-in user who wants to change their password.
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        You&apos;ll use it the next time you log in.
      </p>
      <AuthForm
        action={setNewPassword}
        submitLabel="Save new password"
        pendingLabel="Saving…"
        fields={[
          {
            name: "password",
            label: "New password",
            type: "password",
            autoComplete: "new-password",
            hint: "At least 8 characters.",
          },
          {
            name: "confirm",
            label: "Type it again",
            type: "password",
            autoComplete: "new-password",
          },
        ]}
      />
    </>
  );
}
