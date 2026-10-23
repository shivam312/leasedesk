"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";

/**
 * "Reverse payment": for a payment entered by mistake. Asks why, then says
 * exactly what will happen before doing it.
 */
export function ReversePaymentForm({
  paymentId,
  tenantId,
  amountLabel,
  action,
}: {
  paymentId: string;
  /** For "Record the correct payment" once it is reversed. */
  tenantId: string;
  /** What it applied to invoices, or null if nothing. */
  amountLabel: string | null;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);
  const id = useId();
  if (state.tone === "success")
    return (
      <div className="flex flex-col items-start gap-3">
        <FormMessage message={state.message} tone="success" />
        <Link
          href={`/billing/payments/new?tenant=${tenantId}`}
          className={buttonVariants({ className: "h-11 md:h-9" })}
        >
          Record the correct payment
        </Link>
      </div>
    );
  if (!open)
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-9"
          onClick={() => setOpen(true)}
        >
          Reverse this payment
        </Button>
        <p className="mt-1 text-sm text-muted-foreground">
          For a payment entered by mistake.
        </p>
      </div>
    );
  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-sm">
        {amountLabel
          ? `This adds a reversal dated today that takes ${amountLabel} back off the invoices it paid; they become unpaid again.`
          : "This adds a reversal dated today, so the payment no longer counts as credit."}{" "}
        The payment stays on record, marked reversed. Then record the correct
        one.
      </p>
      <Field label="Why" htmlFor={id} error={state.fieldErrors?.reason}>
        <Input
          id={id}
          name="reason"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Entered against the wrong tenant"
          {...errorProps(id, state.fieldErrors?.reason)}
        />
      </Field>
      <FormMessage message={state.message} tone={state.tone} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="h-11 md:h-9"
        >
          {pending ? "Reversing…" : "Yes, reverse it"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-9"
          onClick={() => setOpen(false)}
        >
          Keep it
        </Button>
      </div>
    </form>
  );
}
