"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { joinTeam } from "@/server/actions/team";

export function JoinForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(joinTeam, {});
  const error = state.fieldErrors?.password;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage message={state.message} />
      <input type="hidden" name="token" value={token} />
      <Field label="Email" htmlFor="email">
        <Input id="email" value={email} readOnly />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters. If you already have a login, use your current password."
        error={error}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          {...errorProps("password", error, true)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="h-11">
        {pending ? "Joining…" : "Join the team"}
      </Button>
    </form>
  );
}
