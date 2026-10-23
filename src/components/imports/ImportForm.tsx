"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** Choose an Excel file and import it; each row to fix is listed after. */
export function ImportForm({
  action,
  submitLabel,
  primary = true,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const id = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        Excel file (.xlsx)
      </label>
      <input
        id={id}
        name="file"
        type="file"
        required
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="text-sm file:mr-3 file:h-11 file:rounded-md file:border file:bg-background file:px-3 md:file:h-9"
      />
      <div>
        <Button
          type="submit"
          variant={primary ? "default" : "outline"}
          disabled={pending}
          className="h-11 md:h-9"
        >
          {pending ? "Importing…" : submitLabel}
        </Button>
      </div>
      {state.message && (
        <div role="status" className="flex flex-col gap-2">
          <FormMessage
            message={state.message}
            tone={state.tone === "success" ? "success" : "error"}
          />
          {state.problems && state.problems.length > 0 && (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto rounded-lg border p-3 text-sm">
              {state.problems.map((p) => (
                <li key={p} className="break-words">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
