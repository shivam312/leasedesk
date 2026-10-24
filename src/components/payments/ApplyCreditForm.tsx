"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/**
 * "Apply ₹X credit": use a tenant's extra payments on unpaid invoices. Also
 * any other one-button action on a tenant ("Remove opening balance").
 */
export function ApplyCreditForm({
  tenantId,
  label,
  action,
  pendingLabel = "Applying…",
}: {
  tenantId: string;
  label: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <FormMessage message={state.message} tone={state.tone} />
      {state.tone !== "success" && (
        <div>
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            className="h-11 md:h-9"
          >
            {pending ? pendingLabel : label}
          </Button>
        </div>
      )}
    </form>
  );
}
