"use server";

// Recording, reversing and applying payments (M5). Owners and accounts only;
// every change is logged by the data layer (src/lib/payments/payments.ts).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appDb, requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatINR } from "@/lib/format";
import { DEPOSIT_KINDS, depositEntrySchema } from "@/lib/payments/deposit-form";
import { DepositError, recordDepositEntry } from "@/lib/payments/deposits";
import { parsePaymentForm } from "@/lib/payments/forms";
import {
  applyCredit,
  PaymentError,
  recordPayment,
  reversePayment,
} from "@/lib/payments/payments";
import { todayInIndia } from "@/lib/today";
import { guardedForm } from "./guard";
import { reportError } from "@/lib/monitoring";

const SOMETHING_WRONG =
  "Something went wrong; nothing was saved. Try again in a few minutes.";

/** "Record payment": save it and apply it to the invoices chosen. */
export async function recordPaymentAction(
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
  const parsed = parsePaymentForm(form.entries());
  if ("state" in parsed) return parsed.state;
  const input = parsed.data;
  let id: string;
  try {
    const { payment } = await runScoped(appDb, member, (s) =>
      recordPayment(s, input, todayInIndia()),
    );
    id = payment.id;
  } catch (error) {
    const values = Object.fromEntries(
      [...form.entries()].filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
    if (error instanceof PaymentError)
      return { message: error.message, values };
    reportError("Recording a payment failed", error, {
      tenantId: input.tenantId,
    });
    return { message: SOMETHING_WRONG, values };
  }
  revalidatePath("/billing");
  revalidatePath("/billing/payments");
  revalidatePath(`/tenants/${input.tenantId}`);
  redirect(`/billing/payments/${id}?recorded=1`);
}

const reverseSchema = z.object({
  paymentId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Say why, e.g. “Entered against the wrong tenant”.")
    .max(200, "Keep the reason under 200 characters."),
});

/** "Reverse payment": a reversal entry dated today; the payment stays on record. */
export async function reversePaymentAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    reverseSchema,
    form,
    async (member, { paymentId, reason }) => {
      let tenantId: string;
      try {
        const reversal = await runScoped(appDb, member, (s) =>
          reversePayment(s, paymentId, todayInIndia(), reason),
        );
        tenantId = reversal.tenantId;
      } catch (error) {
        if (error instanceof PaymentError) return { message: error.message };
        reportError("Reversing a payment failed", error, { paymentId });
        return { message: SOMETHING_WRONG };
      }
      revalidatePath(`/billing/payments/${paymentId}`);
      revalidatePath("/billing/payments");
      revalidatePath(`/tenants/${tenantId}`);
      return {
        message:
          "Payment reversed. The invoices it paid are unpaid again. Record the correct payment if there is one.",
        tone: "success",
      };
    },
  );
}

/** "Apply credit": use a tenant's extra payments on their unpaid invoices. */
export async function applyCreditAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    z.object({ tenantId: z.uuid() }),
    form,
    async (member, { tenantId }) => {
      const applied = await runScoped(appDb, member, (s) =>
        applyCredit(s, tenantId),
      );
      revalidatePath(`/tenants/${tenantId}`);
      revalidatePath("/billing");
      return applied > 0
        ? {
            message: `Applied ${formatINR(applied)} to unpaid invoices.`,
            tone: "success",
          }
        : {
            message: "There are no unpaid invoices to apply the credit to yet.",
          };
    },
  );
}

/** Record a security deposit entry on a lease (owner or accounts). */
export async function recordDepositEntryAction(
  leaseId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    depositEntrySchema,
    form,
    async (member, d) => {
      if (!z.uuid().safeParse(leaseId).success)
        return { message: "That lease couldn't be found." };
      try {
        await runScoped(appDb, member, (s) =>
          recordDepositEntry(
            s,
            {
              leaseId,
              kind: d.kind,
              date: d.date,
              amountPaise: d.amount,
              reference: d.reference,
              note: d.note,
            },
            todayInIndia(),
          ),
        );
      } catch (error) {
        if (error instanceof DepositError)
          return {
            message: error.message,
            values: Object.fromEntries(
              [...form.entries()].map(([k, v]) => [k, String(v)]),
            ),
          };
        throw error;
      }
      revalidatePath(`/leases/${leaseId}`);
      return {
        tone: "success",
        message: `Recorded: ${DEPOSIT_KINDS[d.kind].toLowerCase()}, ${formatINR(d.amount)}.`,
      };
    },
  );
}
