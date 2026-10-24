"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "Apply ₹X credit": use a tenant's extra payments on unpaid invoices. */
export function ApplyCreditForm({
  tenantId,
  label,
  action,
}: {
  tenantId: string;
  label: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
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
            {pending ? "Applying…" : label}
          </Button>
        </div>
      )}
    </form>
  );
}
