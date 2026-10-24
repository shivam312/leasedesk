"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "The daily run hasn't happened since …", with "Run now" for those who bill. */
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
        The daily run hasn&apos;t happened since {sinceLabel}
      </p>
      <p className="text-sm text-muted-foreground">
        It makes each month&apos;s invoices on your run day and sends payment
        reminders. Until it runs again, nothing happens on its own.
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
