"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** "It's right", "Nobody owes anything": tick a setup step by hand. */
export function MarkDoneForm({
  step,
  label,
  action,
}: {
  step: string;
  label: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="step" value={step} />
      {state.tone !== "success" && <FormMessage message={state.message} />}
      <Button
        type="submit"
        variant="outline"
        disabled={pending || state.tone === "success"}
        className="h-11 md:h-9"
      >
        {pending ? "Saving…" : label}
      </Button>
    </form>
  );
}
