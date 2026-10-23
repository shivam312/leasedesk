"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

/** Choose an Excel file and import it; each row to fix is listed after. */
export function ImportForm({
  action,
  submitLabel,
  fileOf,
  next,
  primary = true,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  /** What the file holds, read out to screen readers: "buildings and units". */
  fileOf: string;
  /** Where to go after a successful import. */
  next?: { href: string; label: string };
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const id = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        Excel file (.xlsx)<span className="sr-only"> with {fileOf}</span>
      </label>
      <input
        id={id}
        name="file"
        type="file"
        required
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
        <div
          role={state.tone === "success" ? "status" : "alert"}
          className="flex flex-col gap-2"
        >
          <FormMessage
            message={state.message}
            tone={state.tone === "success" ? "success" : "error"}
          />
          {state.tone === "success" && next && (
            <Link
              href={next.href}
              className="inline-flex min-h-11 items-center self-start text-sm font-medium underline underline-offset-4 md:min-h-9"
            >
              {next.label}
            </Link>
          )}
          {state.problems && state.problems.length > 0 && (
            <ProblemList problems={state.problems} />
          )}
        </div>
      )}
    </form>
  );
}

/** How many rows to fix are shown before "Show all", so a long list doesn't bury the form on a phone. */
const SHOWN_PROBLEMS = 10;

function ProblemList({ problems }: { problems: string[] }) {
  const shown = problems.slice(0, SHOWN_PROBLEMS);
  const rest = problems.slice(SHOWN_PROBLEMS);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <ul aria-label="Rows to fix" className="flex flex-col gap-1">
        {shown.map((p, i) => (
          <li key={`${i}-${p}`} className="break-words">
            {p}
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium md:min-h-9">
            Show {rest.length} more {rest.length === 1 ? "row" : "rows"} to fix
          </summary>
          <ul aria-label="More rows to fix" className="flex flex-col gap-1">
            {rest.map((p, i) => (
              <li key={`${i}-${p}`} className="break-words">
                {p}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
