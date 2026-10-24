"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "Remind all N": asks once, then emails every overdue tenant with an address. */
export function RemindAllForm({
  count,
  action,
}: {
  count: number;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [asking, setAsking] = useState(false);
  const tenants = `${count} overdue ${count === 1 ? "tenant" : "tenants"}`;
  return (
    <form
      action={(form) => {
        setAsking(false);
        formAction(form);
      }}
      className="flex flex-col gap-2"
    >
      {asking ? (
        <div
          role="group"
          aria-label="Remind all"
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <p className="text-sm">
            Email a payment reminder to {tenants} now? Each gets one email for
            their oldest late invoice, asking for the amount after TDS. Anyone
            reminded today is skipped.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-11 md:h-9">
              Email {count === 1 ? "the reminder" : `${count} reminders`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => setAsking(false)}
            >
              Go back
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-11 md:h-9"
            onClick={() => setAsking(true)}
          >
            {pending ? "Sending reminders…" : `Remind all ${count}`}
          </Button>
        </div>
      )}
      <FormMessage message={state.message} tone={state.tone} />
    </form>
  );
}
