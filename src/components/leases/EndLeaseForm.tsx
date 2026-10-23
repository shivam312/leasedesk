"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import type { FormState } from "@/lib/auth/forms";
import { formatDate } from "@/lib/format";

/**
 * End a lease early: the tenant's last day, then a confirmation that says
 * what will happen before anything changes.
 */
export function EndLeaseForm({
  tenantName,
  action,
}: {
  tenantName: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [exitDate, setExitDate] = useState(state.values?.exitDate ?? "");
  const [confirming, setConfirming] = useState(false);
  const id = `${useId()}-exitDate`;
  const error = state.fieldErrors?.exitDate;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(exitDate);
  const endButton = useRef<HTMLButtonElement>(null);
  // Move to the confirmation's button when it opens, so it's read and reached.
  useEffect(() => {
    if (confirming) endButton.current?.focus();
  }, [confirming]);

  return (
    <form
      action={(form) => {
        setConfirming(false);
        formAction(form);
      }}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        // Enter in the date field asks first; it never ends the lease.
        if (!confirming) {
          e.preventDefault();
          if (validDate) setConfirming(true);
        }
      }}
    >
      <Field
        label="Tenant's last day"
        htmlFor={id}
        hint="The lease and its charges end on this day."
        error={error}
      >
        <DateInput
          id={id}
          name="exitDate"
          required
          value={exitDate}
          onChange={(e) => {
            setExitDate(e.target.value);
            setConfirming(false);
          }}
          {...errorProps(id, error, true)}
        />
      </Field>
      {state.message && (
        <FormMessage message={state.message} tone={state.tone} />
      )}
      {confirming && validDate ? (
        <div
          className="flex flex-col gap-3 rounded-lg border p-4"
          role="group"
          aria-label="Confirm ending the lease"
        >
          <p className="text-sm">
            End {tenantName}&apos;s lease on {formatDate(exitDate)}? Billing
            stops after that day and the last invoice covers only part of the
            month. Invoices already sent stay as they are; for anything billed
            after that day, issue a credit note.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={endButton}
              type="submit"
              variant="destructive"
              disabled={pending}
              className="h-11 md:h-9"
            >
              {pending ? "Ending…" : "End lease"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => setConfirming(false)}
            >
              Keep lease
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            disabled={!validDate}
            onClick={() => setConfirming(true)}
          >
            End lease on this day
          </Button>
        </div>
      )}
    </form>
  );
}
