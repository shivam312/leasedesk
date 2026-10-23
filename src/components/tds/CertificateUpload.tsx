"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";

/** Upload one quarter's TDS certificate for a tenant. */
export function CertificateUpload({
  tenantId,
  financialYear,
  quarter,
  label,
  action,
}: {
  tenantId: string;
  financialYear: string;
  quarter: number;
  label: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const id = useId();
  const [tooBig, setTooBig] = useState(false);
  if (state.tone === "success")
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <FormMessage message={state.message} tone="success" />
        <Link
          href={`/billing/tds?fy=${financialYear}`}
          className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
        >
          Back to TDS certificates
        </Link>
      </div>
    );
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="financialYear" value={financialYear} />
      <input type="hidden" name="quarter" value={quarter} />
      <Field
        label={label}
        htmlFor={id}
        hint="A PDF from TRACES, or a scan (PDF, PNG or JPG, up to 3 MB)."
        error={
          tooBig
            ? "That file is over 3 MB. Choose a smaller scan or PDF."
            : state.fieldErrors?.file
        }
      >
        <Input
          id={id}
          name="file"
          type="file"
          required
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) =>
            setTooBig((e.target.files?.[0]?.size ?? 0) > 3 * 1024 * 1024)
          }
          {...errorProps(id, state.fieldErrors?.file, true)}
        />
      </Field>
      <FormMessage message={state.message} tone={state.tone} />
      <div>
        <Button
          type="submit"
          disabled={pending || tooBig}
          className="h-11 md:h-9"
        >
          {pending ? "Uploading…" : "Upload certificate"}
        </Button>
      </div>
    </form>
  );
}
