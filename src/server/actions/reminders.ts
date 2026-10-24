"use server";

// Reminders a person sends from the invoice page.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb, requireMember } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import type { FormState } from "@/lib/auth/forms";
import { EMAIL_NOT_SET_UP, emailDriver, emailMode } from "@/lib/email";
import { recordWhatsappReminder } from "@/lib/reminders/manual";
import { remindAllMessage, remindAllOverdue } from "@/lib/reminders/remind-all";
import { todayInIndia } from "@/lib/today";
import { reportError } from "@/lib/monitoring";
import { guardedForm } from "./guard";

/**
 * Record a tap on "Remind on WhatsApp". The link itself opens in the
 * browser straight away; this only writes it down, with who sent it.
 */
export async function recordWhatsappReminderAction(
  invoiceId: string,
): Promise<{ message?: string }> {
  const member = await requireMember();
  try {
    requirePermission(member, "manage_billing");
  } catch (error) {
    if (error instanceof PermissionError) return { message: error.message };
    throw error;
  }
  const id = z.uuid().safeParse(invoiceId);
  if (!id.success) return { message: "That invoice couldn't be found." };
  try {
    await runScoped(appDb, member, (s) =>
      recordWhatsappReminder(s, id.data, todayInIndia()),
    );
  } catch (error) {
    reportError("Recording a WhatsApp reminder failed", error, {
      invoiceId,
    });
    return {
      message:
        "WhatsApp opened, but the reminder couldn't be added to the list below.",
    };
  }
  revalidatePath(`/billing/invoices/${id.data}`);
  revalidatePath("/today");
  return {};
}

/** "Remind all" on Today: email every overdue tenant now, and list who has no email. */
export async function remindAllAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm("manage_billing", z.object({}), form, async (member) => {
    if (emailMode() === "not_set_up") return { message: EMAIL_NOT_SET_UP };
    try {
      const result = await remindAllOverdue(
        appDb,
        member,
        todayInIndia(),
        emailDriver(),
      );
      revalidatePath("/today");
      return {
        tone: result.failed.length ? "error" : "success",
        message: remindAllMessage(result),
      };
    } catch (error) {
      reportError("Remind all failed", error, {});
      return {
        message: "The reminders couldn't be sent. Try again in a few minutes.",
      };
    }
  });
}
