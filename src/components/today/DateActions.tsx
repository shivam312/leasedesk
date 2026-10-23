"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";
import { useNotifying } from "./Notices";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

function DateButton({
  dateId,
  label,
  pendingLabel,
  action,
}: {
  dateId: string;
  label: string;
  pendingLabel: string;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(useNotifying(action), {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="dateId" value={dateId} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="h-11 self-start md:h-9"
      >
        {pending ? pendingLabel : label}
      </Button>
      <FormMessage message={state.message} tone={state.tone} />
    </form>
  );
}

/** "Mark done" and "Remind me later" on a lease date in the Today list. */
export function DateActions({
  dateId,
  what,
  markDone,
  snooze,
  snoozeDays,
}: {
  dateId: string;
  /** e.g. "Rent increase for Acme", for screen readers. */
  what: string;
  markDone: Action;
  snooze: Action;
  snoozeDays: number;
}) {
  return (
    <div role="group" aria-label={what} className="flex flex-wrap gap-2">
      <DateButton
        dateId={dateId}
        label="Mark as done"
        pendingLabel="Marking done…"
        action={markDone}
      />
      <DateButton
        dateId={dateId}
        label={`Remind me in ${snoozeDays} days`}
        pendingLabel="Snoozing…"
        action={snooze}
      />
    </div>
  );
}
