"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "Make invoices for <month>": runs the month's billing now. */
export function RunBillingForm({
  month,
  monthLabel,
  hasDrafts,
  action,
}: {
  month: string;
  monthLabel: string;
  /** Running again replaces drafts, so say so. */
  hasDrafts: boolean;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const hintId = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="month" value={month} />
      <div>
        <Button
          type="submit"
          disabled={pending}
          variant={hasDrafts ? "outline" : "default"}
          className="h-11 md:h-9"
          aria-describedby={hintId}
        >
          {pending
            ? "Making invoices…"
            : hasDrafts
              ? `Make ${monthLabel} invoices again`
              : `Make ${monthLabel} invoices`}
        </Button>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        {hasDrafts
          ? "Updates invoices not sent yet with any lease changes. Sent invoices stay as they are."
          : "Works out every lease's invoice for the month. Nothing is sent until you send it."}
      </p>
      <FormMessage message={state.message} tone={state.tone} />
      {state.problems && state.problems.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {state.problems.length === 1
              ? "1 lease needs attention:"
              : `${state.problems.length} leases need attention:`}
          </p>
          <ul className="list-disc pl-5">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
