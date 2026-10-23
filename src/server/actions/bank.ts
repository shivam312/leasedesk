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
import { confirmLine, ignoreLines, refreshSuggestions } from "@/lib/bank/match";
import { runScoped } from "@/lib/db/scoped";
import { PaymentError } from "@/lib/payments/payments";
import { todayInIndia } from "@/lib/today";
import { z } from "zod";
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

const uuid = z.uuid();

/** The ticked lines, each with the tenant chosen for it. */
function chosenLines(form: FormData) {
  const ids = form
    .getAll("line")
    .filter(
      (v): v is string => typeof v === "string" && uuid.safeParse(v).success,
    );
  return [...new Set(ids)].map((id) => {
    const tenant = form.get(`tenant_${id}`);
    return {
      id,
      tenantId:
        typeof tenant === "string" && uuid.safeParse(tenant).success
          ? tenant
          : null,
    };
  });
}

async function guarded() {
  const member = await requireMember();
  try {
    requirePermission(member, "manage_billing");
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };
    throw error;
  }
  return { member };
}

/**
 * "Record N payments": each ticked line becomes a payment from the tenant
 * chosen for it, each in its own transaction, so one problem doesn't stop
 * the rest. Suggestions for what's left are worked out again afterwards.
 */
export async function confirmMatchesAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const g = await guarded();
  if ("error" in g) return { message: g.error };
  const lines = chosenLines(form);
  if (lines.length === 0)
    return { message: "Tick the bank lines to record as payments." };
  const today = todayInIndia();
  let recorded = 0;
  const problems: string[] = [];
  for (const [index, l] of lines.entries()) {
    if (!l.tenantId) {
      problems.push(`Line ${index + 1}: choose the tenant who paid.`);
      continue;
    }
    try {
      await runScoped(appDb, g.member, (s) =>
        confirmLine(s, l.id, l.tenantId!, today),
      );
      recorded++;
    } catch (error) {
      if (error instanceof PaymentError) problems.push(error.message);
      else {
        console.error("Confirming a bank line failed", l.id, error);
        problems.push(
          "One line couldn't be recorded because something went wrong. Try it again.",
        );
      }
    }
  }
  await runScoped(appDb, g.member, (s) => refreshSuggestions(s));
  revalidatePath("/billing/bank/match");
  revalidatePath("/billing/payments");
  revalidatePath("/billing");
  return {
    message:
      recorded > 0
        ? `Recorded ${recorded} ${recorded === 1 ? "payment" : "payments"}.`
        : "No payments were recorded.",
    tone: recorded > 0 ? "success" : "error",
    problems,
  };
}

/** "Not rent": set ticked lines aside (bank interest, refunds, transfers). */
export async function ignoreLinesAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const g = await guarded();
  if ("error" in g) return { message: g.error };
  const lines = chosenLines(form);
  if (lines.length === 0)
    return { message: "Tick the lines that aren't rent." };
  const n = await runScoped(appDb, g.member, (s) =>
    ignoreLines(
      s,
      lines.map((l) => l.id),
    ),
  );
  revalidatePath("/billing/bank/match");
  return {
    message: `Set aside ${n} ${n === 1 ? "line" : "lines"} as not rent.`,
    tone: "success",
  };
}
