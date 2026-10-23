"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";

export interface AuthField {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  hint?: string;
}

/** A one-column form for the sign-up, login and welcome pages. */
export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: AuthField[];
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage message={state.message} />
      {fields.map((f, i) => {
        const error = state.fieldErrors?.[f.name];
        return (
          <Field
            key={f.name}
            label={f.label}
            htmlFor={f.name}
            hint={f.hint}
            error={error}
          >
            <Input
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              defaultValue={state.values?.[f.name]}
              autoFocus={i === 0}
              required
              {...errorProps(f.name, error)}
            />
          </Field>
        );
      })}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
