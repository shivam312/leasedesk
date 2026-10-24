"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/**
 * A button for something that can't be undone (removing a contact or a team
 * member): the first tap asks, in words, what will happen; the second does
 * it. An outline button, so it never competes with the screen's main one.
 */
export function ConfirmActionForm({
  action,
  label,
  question,
  confirmLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  label: string;
  question: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [asking, setAsking] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) confirm.current?.focus();
  }, [asking]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {asking ? (
        <div
          role="group"
          aria-label={label}
          className="flex flex-col gap-3 rounded-lg border p-4"
        >
          <p className="text-sm">{question}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirm}
              type="submit"
              variant="destructive"
              disabled={pending}
              className="h-11 md:h-9"
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => {
                setAsking(false);
                requestAnimationFrame(() => start.current?.focus());
              }}
            >
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            ref={start}
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            onClick={() => setAsking(true)}
          >
            {label}
          </Button>
        </div>
      )}
      <FormMessage message={state.message} tone={state.tone} />
    </form>
  );
}
