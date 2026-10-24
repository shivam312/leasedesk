"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";

/** Choose what it is and the file; outlined, beside the page's main button. */
export function UploadDocumentForm({
  kinds,
  defaultKind,
  maxMb,
  action,
}: {
  kinds: [string, string][];
  defaultKind: string;
  maxMb: number;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const base = useId();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.tone === "success") form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={formAction} className="flex flex-col gap-4">
      <Field
        label="What it is"
        htmlFor={`${base}-kind`}
        error={state.fieldErrors?.kind}
      >
        <Select
          id={`${base}-kind`}
          name="kind"
          defaultValue={defaultKind}
          {...errorProps(`${base}-kind`, state.fieldErrors?.kind)}
        >
          {kinds.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="File"
        htmlFor={`${base}-file`}
        hint={`A PDF, PNG or JPG, up to ${maxMb} MB.`}
        error={state.fieldErrors?.file}
      >
        <Input
          id={`${base}-file`}
          name="file"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          required
          {...errorProps(`${base}-file`, state.fieldErrors?.file, true)}
        />
      </Field>
      <div>
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="h-11 md:h-9"
        >
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      <FormMessage message={state.message} tone={state.tone} />
    </form>
  );
}
