"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "Request from tenant": one tap emails the tenant for this quarter's certificate. */
export function RequestCertificateForm({
  tenantId,
  financialYear,
  quarter,
  amount,
  askedOn,
  action,
}: {
  tenantId: string;
  financialYear: string;
  quarter: number;
  amount: number;
  /** "24-10-2026" when last asked. */
  askedOn: string | null;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="financialYear" value={financialYear} />
      <input type="hidden" name="quarter" value={quarter} />
      <input type="hidden" name="amount" value={amount} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center text-left text-sm underline md:min-h-0"
      >
        {pending ? "Asking…" : "Request from tenant"}
      </button>
      {askedOn && (
        <span className="text-xs text-muted-foreground">
          Asked on {askedOn}
        </span>
      )}
      <FormMessage message={state.message} tone={state.tone} />
    </form>
  );
}
