"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { brand } from "@/lib/config/brand";
import { invite } from "@/server/actions/team";

export function InviteForm() {
  const [state, action, pending] = useActionState(invite, {});
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const link =
    state.link && typeof window !== "undefined"
      ? `${window.location.origin}${state.link}`
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <form
        action={action}
        className="flex flex-col gap-4 md:flex-row md:items-end"
        noValidate
      >
        <Field
          label="Email"
          htmlFor="invite-email"
          error={state.fieldErrors?.email}
          className="md:flex-1"
          hint="We'll make a link for you to send."
        >
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={state.values?.email}
            required
            {...errorProps("invite-email", state.fieldErrors?.email, true)}
          />
        </Field>
        <Field
          label="What they can do"
          htmlFor="invite-role"
          error={state.fieldErrors?.role}
          className="md:w-56"
        >
          <Select
            id="invite-role"
            name="role"
            defaultValue={state.values?.role ?? "accounts"}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r].label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating link…" : "Create invite link"}
        </Button>
      </form>
      <FormMessage message={state.message} />
      {link && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm"
        >
          <p>
            Send this link to <strong>{state.invitedEmail}</strong>. It works
            once, and we haven&apos;t emailed it.
          </p>
          {copyFailed && (
            <p>Couldn&apos;t copy. Select the link and copy it.</p>
          )}
          <code className="block overflow-x-auto rounded bg-background px-2 py-1 text-xs">
            {link}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-0"
              onClick={() => {
                navigator.clipboard
                  .writeText(link)
                  .then(() => setCopied(true))
                  .catch(() => setCopyFailed(true));
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-0"
            >
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Join our team on ${brand.name}: ${link}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
