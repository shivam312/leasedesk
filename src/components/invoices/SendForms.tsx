"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * A button that asks first, saying exactly what will happen, then submits.
 * Used for sending invoices, which can't be changed afterwards.
 */
function ConfirmForm({
  fields,
  label,
  question,
  consequence,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  primary,
  action,
}: {
  fields: Record<string, string>;
  label: string;
  question: string;
  /** What happens, in a smaller line under the question. */
  consequence: string;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  primary: boolean;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  return (
    <form
      action={(form) => {
        setConfirming(false);
        formAction(form);
      }}
      className="flex flex-col gap-3"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {confirming ? (
        <div
          className="flex flex-col gap-3 rounded-lg border p-4"
          role="group"
          aria-label={label}
        >
          <p className="text-sm font-medium">{question}</p>
          <p className="text-sm text-muted-foreground">{consequence}</p>
          <div className="flex flex-wrap gap-2">
            <Button ref={confirmButton} type="submit" className="h-11 md:h-9">
              {confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => setConfirming(false)}
            >
              {cancelLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant={primary ? "default" : "outline"}
            className="h-11 md:h-9"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            {pending ? pendingLabel : label}
          </Button>
        </div>
      )}
      <FormMessage message={state.message} tone={state.tone} />
      {state.problems && state.problems.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {state.problems.length === 1
              ? "1 invoice needs attention:"
              : `${state.problems.length} invoices need attention:`}
          </p>
          <ul className="list-disc pl-5 break-words">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

/** "Send 38 invoices": number and email every invoice not sent yet. */
export function SendAllForm({
  month,
  monthLabel,
  count,
  total,
  consequence,
  primary = true,
  action,
}: {
  month: string;
  monthLabel: string;
  count: number;
  /** The drafts' grand total, formatted. */
  total: string;
  /** What sending does, from sendAllConsequence. */
  consequence: string;
  /** A filled button (the default); outlined when another is the main one. */
  primary?: boolean;
  action: Action;
}) {
  const invoicesWord = count === 1 ? "invoice" : "invoices";
  return (
    <ConfirmForm
      fields={{ month }}
      label={`Send ${count} ${invoicesWord}`}
      question={`Send ${count} ${monthLabel} ${invoicesWord} for ${total} in all?`}
      consequence={consequence}
      confirmLabel={`Send ${count} ${invoicesWord}`}
      pendingLabel="Sending…"
      cancelLabel="Go back"
      primary={primary}
      action={action}
    />
  );
}

/** Send one invoice from its page. */
export function SendInvoiceForm({
  invoiceId,
  tenantName,
  total,
  action,
}: {
  invoiceId: string;
  tenantName: string;
  total: string;
  action: Action;
}) {
  return (
    <ConfirmForm
      fields={{ invoiceId }}
      label="Send this invoice"
      question={`Send ${tenantName} this invoice for ${total}?`}
      consequence="It gets its invoice number and is emailed with its PDF to their billing contacts. It can't be changed afterwards; corrections are credit notes."
      confirmLabel="Send invoice"
      pendingLabel="Sending…"
      cancelLabel="Go back"
      primary
      action={action}
    />
  );
}

/** Email a sent invoice again, e.g. after fixing the tenant's address. */
export function EmailAgainForm({
  invoiceId,
  action,
}: {
  invoiceId: string;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div>
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="h-11 md:h-9"
        >
          {pending ? "Emailing…" : "Email again"}
        </Button>
      </div>
      <FormMessage message={state.message} tone={state.tone} />
    </form>
  );
}
