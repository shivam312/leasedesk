// Validation for the sign-up, login and welcome forms. Messages are shown to
// users as they are, so they are plain sentences (docs/UX_PRINCIPLES.md).

import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .pipe(z.email("Enter a valid email address, like name@company.com."));

const organizationName = z
  .string()
  .trim()
  .min(2, "Enter your company or building name.")
  .max(120, "Keep the name under 120 characters.");

export const signUpSchema = z.object({
  organizationName,
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters for your password.")
    .max(72, "Use at most 72 characters for your password."),
});

export const logInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const welcomeSchema = z.object({ organizationName });

/** What a form action returns: a message for the form, and one per field. */
export interface FormState {
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** What the user typed, so the form keeps it after an error (never the password). */
  values?: Partial<Record<string, string>>;
}

/** Parse FormData with a schema; on failure, the first message per field. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  form: FormData,
): { data: z.output<S> } | { state: FormState } {
  const raw = Object.fromEntries(
    [...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]),
  );
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  const values = { ...raw };
  delete values.password;
  return { state: { fieldErrors, values } };
}
