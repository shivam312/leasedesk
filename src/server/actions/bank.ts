"use server";

// Bank accounts and statement imports (M5). Owners and accounts only.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { bankAccountSchema, parseImportForm } from "@/lib/bank/forms";
import {
  addBankAccount,
  ImportError,
  importStatement,
} from "@/lib/bank/imports";
import { runScoped } from "@/lib/db/scoped";
import { guardedForm } from "./guard";

/** "Add bank account". */
export async function addBankAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    bankAccountSchema,
    form,
    async (member, data) => {
      try {
        await runScoped(appDb, member, (s) => addBankAccount(s, data));
      } catch (error) {
        if (error instanceof ImportError)
          return { message: error.message, values: data };
        throw error;
      }
      revalidatePath("/billing/bank");
      return {
        message: `Added ${data.bankName} account ending ${data.accountLast4}. Import its statement below.`,
        tone: "success",
      };
    },
  );
}

/** "Import N credits": save the statement's new credit lines. */
export async function importStatementAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    requirePermission(member, "manage_billing");
  } catch (error) {
    if (error instanceof PermissionError) return { message: error.message };
    throw error;
  }
  const parsed = parseImportForm(form);
  if ("state" in parsed) return parsed.state;
  let id: string;
  try {
    const result = await runScoped(appDb, member, (s) =>
      importStatement(s, parsed.data),
    );
    id = result.import.id;
  } catch (error) {
    if (error instanceof ImportError) return { message: error.message };
    console.error("Statement import failed", error);
    return {
      message:
        "Something went wrong; nothing was imported. Try again in a few minutes.",
    };
  }
  revalidatePath("/billing/bank");
  redirect(`/billing/bank/imports/${id}`);
}
