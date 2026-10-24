"use server";

// Uploading a tenant's TDS certificate for a quarter (M5). Owners and
// accounts only.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseFinancialYear } from "@/lib/payments/statement";
import { appDb, requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/auth/forms";
import { PermissionError, requirePermission } from "@/lib/auth/roles";
import { TAX_LABELS } from "@/lib/config/tax-labels";
import { runScoped } from "@/lib/db/scoped";
import { supabaseStore } from "@/lib/files/supabase";
import { attachCertificate, CertificateError } from "@/lib/tds/certificates";
import { reportError } from "@/lib/monitoring";
import { EMAIL_NOT_SET_UP, emailDriver, emailMode } from "@/lib/email";
import { requestCertificate } from "@/lib/tds/requests";
import { todayInIndia } from "@/lib/today";
import { guardedForm } from "./guard";

const schema = z.object({
  tenantId: z.uuid(),
  financialYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((fy) => (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5))),
  quarter: z.coerce.number().int().min(1).max(4),
});

/** "Upload certificate": save the file and mark the quarter's TDS received. */
export async function uploadCertificateAction(
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
  const parsed = schema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success)
    return {
      message:
        "Something about this page is out of date. Go back to the TDS list and try again.",
    };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return {
      fieldErrors: { file: `Choose the ${TAX_LABELS.tdsCertificate} file.` },
    };
  const { tenantId, financialYear, quarter } = parsed.data;
  try {
    const store = await supabaseStore();
    const bytes = new Uint8Array(await file.arrayBuffer());
    await runScoped(appDb, member, (s) =>
      attachCertificate(s, store, {
        tenantId,
        financialYear,
        quarter: quarter as 1 | 2 | 3 | 4,
        fileName: file.name,
        contentType: file.type,
        bytes,
      }),
    );
  } catch (error) {
    if (error instanceof CertificateError)
      return { fieldErrors: { file: error.message } };
    reportError("Certificate upload failed", error, { tenantId });
    return {
      message: "The certificate couldn't be saved. Try again in a few minutes.",
    };
  }
  revalidatePath("/billing/tds");
  return {
    message: `Saved. Q${quarter} TDS for this tenant now shows as received.`,
    tone: "success",
  };
}

const requestSchema = z.object({
  tenantId: z.uuid(),
  financialYear: z
    .string()
    .refine((v) => parseFinancialYear(v) !== null, "Choose a financial year."),
  quarter: z.coerce.number().int().min(1).max(4),
});

/** "Request from tenant": email the tenant for one quarter's certificate. */
export async function requestCertificateAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return guardedForm(
    "manage_billing",
    requestSchema,
    form,
    async (member, d) => {
      if (emailMode() === "not_set_up") return { message: EMAIL_NOT_SET_UP };
      const r = await requestCertificate(
        appDb,
        member,
        {
          tenantId: d.tenantId,
          financialYear: d.financialYear,
          quarter: d.quarter as 1 | 2 | 3 | 4,
        },
        todayInIndia(),
        emailDriver(),
      );
      revalidatePath("/billing/tds");
      if (!r) return { message: "That tenant couldn't be found." };
      switch (r.kind) {
        case "sent":
          return { tone: "success", message: `Asked ${r.to.join(", ")}.` };
        case "already_today":
          return { message: "Already asked today." };
        case "nothing_missing":
          return {
            message:
              "No certificate is missing for that quarter any more. Reload the page.",
          };
        case "no_email":
          return {
            message:
              "They have no email address. Add one on the tenant's page, or ask them on WhatsApp.",
          };
        case "failed":
          return { message: `Couldn't send: ${r.message}` };
      }
    },
  );
}
