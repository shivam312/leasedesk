"use server";

// Reminders a person sends from the invoice page.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appDb, requireMember } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { recordWhatsappReminder } from "@/lib/reminders/manual";
import { todayInIndia } from "@/lib/today";

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
    console.error("Recording a WhatsApp reminder failed", invoiceId, error);
    return {
      message:
        "WhatsApp opened, but the reminder couldn't be added to the list below.",
    };
  }
  revalidatePath(`/billing/invoices/${id.data}`);
  revalidatePath("/today");
  return {};
}
