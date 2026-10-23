"use client";

import { startTransition, useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
  /** Shown under "More options" (docs/UX_PRINCIPLES.md, rule 4). */
  advanced?: boolean;
}

/**
 * A one-column form with labels above fields, plain-words errors, and the
 * values kept after an error (build-screen skill).
 */
export function SimpleForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  secondary = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: FormField[];
  submitLabel: string;
  pendingLabel: string;
  /** For a form that isn't the page's main action. */
  secondary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Unique ids: Next.js keeps the previous page in the DOM, hidden, so two
  // forms can be on the page at once.
  const prefix = useId();
  const basic = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);
  const render = (f: FormField) => {
    const error = state.fieldErrors?.[f.name];
    const value = state.values?.[f.name] ?? f.defaultValue ?? "";
    const id = `${prefix}-${f.name}`;
    const common = {
      id,
      name: f.name,
      defaultValue: value,
      required: f.required,
      autoComplete: f.autoComplete ?? "off",
      ...errorProps(id, error, Boolean(f.hint)),
    };
    return (
      <Field
        key={f.name}
        label={f.required ? f.label : `${f.label} (optional)`}
        htmlFor={id}
        hint={f.hint}
        error={error}
      >
        {f.type === "textarea" ? (
          <Textarea {...common} rows={3} />
        ) : f.type === "select" ? (
          <Select {...common}>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            {...common}
            type={f.type === "number" ? "text" : (f.type ?? "text")}
            inputMode={
              f.inputMode ?? (f.type === "number" ? "numeric" : undefined)
            }
          />
        )}
      </Field>
    );
  };

  return (
    <form
      // Submitted by hand rather than with `action`, so React doesn't reset
      // the fields: after an error, what was typed stays.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex max-w-xl flex-col gap-4"
      noValidate
    >
      <FormMessage message={state.message} tone={state.tone} />
      {basic.map(render)}
      {advanced.length > 0 && (
        <details
          className="rounded-md border px-4 py-2"
          open={advanced.some((f) => state.fieldErrors?.[f.name])}
        >
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
            More options
          </summary>
          <div className="mt-3 flex flex-col gap-4 pb-2">
            {advanced.map(render)}
          </div>
        </details>
      )}
      <div>
        <Button
          type="submit"
          variant={secondary ? "outline" : "default"}
          disabled={pending}
          className="h-11 md:h-9"
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
