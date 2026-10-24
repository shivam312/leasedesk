"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";

/**
 * Choose what it is and the file. The file goes straight to Storage (a
 * signed upload URL), so it can be up to the bucket's limit; the server
 * checks it again before it's recorded. Outlined, beside the page's main button.
 */
export function UploadDocumentForm({
  kinds,
  defaultKind,
  maxBytes,
  prepare,
  finish,
}: {
  kinds: [string, string][];
  defaultKind: string;
  maxBytes: number;
  prepare: (
    size: number,
  ) => Promise<{ url: string; path: string } | { error: string }>;
  finish: (input: {
    path: string;
    kind: string;
    fileName: string;
  }) => Promise<FormState>;
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, setPending] = useState(false);
  const base = useId();
  const form = useRef<HTMLFormElement>(null);
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  async function upload(data: FormData) {
    const file = data.get("file");
    const kind = String(data.get("kind") ?? "");
    if (!(file instanceof File) || file.size === 0)
      return setState({ fieldErrors: { file: "Choose the file to upload." } });
    // Said before anything is sent.
    if (file.size > maxBytes)
      return setState({
        fieldErrors: {
          file: `That file is ${Math.round(file.size / (1024 * 1024))} MB; the most is ${maxMb} MB. Upload a smaller scan, or a PDF.`,
        },
      });
    setPending(true);
    try {
      const signed = await prepare(file.size);
      if ("error" in signed)
        return setState({ fieldErrors: { file: signed.error } });
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const put = await fetch(signed.url, {
        method: "PUT",
        body,
        headers: { "x-upsert": "false" },
      });
      if (!put.ok)
        return setState({
          message:
            "The upload didn't work. Check your connection and try again.",
        });
      const done = await finish({
        path: signed.path,
        kind,
        fileName: file.name,
      });
      setState(done);
      if (done.tone === "success") form.current?.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        void upload(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-4"
    >
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
