// Shared start of every form action: who is signed in, may they do this, and
// is the input valid. Not a server action itself (no "use server").

import type { z } from "zod";
import { requireMember, type Member } from "@/lib/auth";
import { parseForm, type FormState } from "@/lib/auth/forms";
import {
  PermissionError,
  requirePermission,
  type Permission,
} from "@/lib/auth/roles";

/**
 * Check the permission and parse the form, then run `fn`. A refusal or
 * invalid input becomes a FormState for the form to show.
 */
export async function guardedForm<S extends z.ZodType>(
  permission: Permission,
  schema: S,
  form: FormData,
  fn: (member: Member, data: z.output<S>) => Promise<FormState>,
): Promise<FormState> {
  const member = await requireMember();
  try {
    requirePermission(member, permission);
  } catch (error) {
    if (error instanceof PermissionError) return { message: error.message };
    throw error;
  }
  const parsed = parseForm(schema, form);
  if ("state" in parsed) return parsed.state;
  return fn(member, parsed.data);
}
