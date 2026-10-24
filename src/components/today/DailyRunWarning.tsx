"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "Automatic billing hasn't run since …", with "Run now" for those who bill. */
export function DailyRunWarning({
  sinceLabel,
  canRun,
  action,
}: {
  sinceLabel: string;
  canRun: boolean;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Card
      role="alert"
      className="flex max-w-3xl flex-col gap-2 border-amber-300"
    >
      <p className="font-medium">
        Automatic billing hasn&apos;t run since {sinceLabel}
      </p>
      <p className="text-sm text-muted-foreground">
        Each month&apos;s invoices and the payment reminders are made
        automatically. Until it runs again, nothing happens on its own.
      </p>
      {canRun ? (
        <form action={formAction}>
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            className="h-11 md:h-9"
          >
            {pending ? "Running…" : "Run now"}
          </Button>
        </form>
      ) : (
        <p className="text-sm">Ask the owner or accountant to run it.</p>
      )}
      <FormMessage message={state.message} tone={state.tone} />
    </Card>
  );
}
