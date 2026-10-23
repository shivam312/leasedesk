// Validation for the tenant and contact forms. TDS is set per charge type
// (D10): rent up front; CAM, parking and other charges follow rent unless
// changed under "More options". Messages are shown as they are.

import { z } from "zod";
import {
  GST_STATES,
  gstinProblem,
  isValidPan,
  normalizeId,
} from "@/lib/india/identifiers";
import { percentToBp } from "@/lib/settings/rules-form";
import type { StoredSettings } from "@/lib/settings/schema";

const blankToNull = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s));

/** "98200 12345", "+91-9820012345" → "+919820012345"; null if it isn't a phone number. */
export function normalizePhone(text: string): string | null {
  const digits = text.replace(/[\s()-]/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^\+91[6-9]\d{9}$/.test(digits)) return digits;
  if (/^\+?\d{8,15}$/.test(digits))
    return digits.startsWith("+") ? digits : `+${digits}`;
  return null;
}

const phone = blankToNull.transform((s, ctx) => {
  if (s === null) return null;
  const value = normalizePhone(s);
  if (!value) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a phone number, like 98200 12345.",
    });
    return z.NEVER;
  }
  return value;
});

const email = blankToNull.pipe(
  z.email("Enter a valid email address, like accounts@company.com.").nullable(),
);

const rate = (what: string) =>
  blankToNull.transform((s, ctx) => {
    if (s === null) return null;
    const bp = percentToBp(s);
    if (bp === null || bp > 10000) {
      ctx.addIssue({
        code: "custom",
        message: `Enter the TDS rate on ${what} as a percentage, like 10.`,
      });
      return z.NEVER;
    }
    return bp;
  });

const yesNo = z.enum(["yes", "no", "same"]);

export const TDS_GROUPS = [
  { key: "Cam", label: "maintenance (CAM)" },
  { key: "Parking", label: "parking" },
  { key: "Other", label: "utilities, signage and other charges" },
] as const;

export const tenantSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(2, "Enter the tenant's name, as on their invoices.")
      .max(200),
    gstin: blankToNull.pipe(
      z
        .string()
        .transform(normalizeId)
        .superRefine((v, ctx) => {
          const problem = gstinProblem(v);
          if (problem) ctx.addIssue({ code: "custom", message: problem });
        })
        .nullable(),
    ),
    pan: blankToNull.pipe(
      z
        .string()
        .transform(normalizeId)
        .refine(
          isValidPan,
          "A PAN is 5 letters, 4 digits and a letter, like AABCD1234E.",
        )
        .nullable(),
    ),
    billingAddress: z
      .string()
      .trim()
      .min(5, "Enter the address printed on their invoices."),
    stateCode: z
      .string()
      .refine(
        (s) => s in GST_STATES,
        "Choose the state of their billing address.",
      ),
    deductsTdsRent: z.enum(["yes", "no"]),
    tdsRateRent: rate("rent"),
    deductsTdsCam: yesNo,
    tdsRateCam: rate("maintenance (CAM)"),
    deductsTdsParking: yesNo,
    tdsRateParking: rate("parking"),
    deductsTdsOther: yesNo,
    tdsRateOther: rate("other charges"),
    notes: blankToNull,
  })
  .superRefine((t, ctx) => {
    if (t.gstin && t.gstin.slice(0, 2) !== t.stateCode) {
      ctx.addIssue({
        code: "custom",
        path: ["stateCode"],
        message: `This GSTIN is registered in ${GST_STATES[t.gstin.slice(0, 2)] ?? "another state"}. Choose that state.`,
      });
    }
    if (t.gstin && t.pan && t.gstin.slice(2, 12) !== t.pan) {
      ctx.addIssue({
        code: "custom",
        path: ["pan"],
        message: "This PAN doesn't match the one inside the GSTIN.",
      });
    }
  })
  .transform((t) => {
    const rentOn = t.deductsTdsRent === "yes";
    const rentRate = t.tdsRateRent ?? 1000;
    const group = (on: "yes" | "no" | "same", rateBp: number | null) => ({
      on: on === "same" ? rentOn : on === "yes",
      rate: rateBp ?? rentRate,
    });
    const cam = group(t.deductsTdsCam, t.tdsRateCam);
    const parking = group(t.deductsTdsParking, t.tdsRateParking);
    const other = group(t.deductsTdsOther, t.tdsRateOther);
    return {
      companyName: t.companyName,
      gstin: t.gstin,
      pan: t.pan ?? (t.gstin ? t.gstin.slice(2, 12) : null),
      billingAddress: t.billingAddress,
      stateCode: t.stateCode,
      deductsTdsRent: rentOn,
      tdsRateBpRent: rentRate,
      deductsTdsCam: cam.on,
      tdsRateBpCam: cam.rate,
      deductsTdsParking: parking.on,
      tdsRateBpParking: parking.rate,
      deductsTdsOther: other.on,
      tdsRateBpOther: other.rate,
      notes: t.notes,
    };
  });

export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the contact's name."),
    role: z.enum(["billing", "admin", "legal", "other"]),
    email,
    phone,
    whatsapp: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  })
  .superRefine((c, ctx) => {
    if (!c.email && !c.phone)
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message:
          "Enter an email or a phone number, so invoices and reminders can reach them.",
      });
    if (c.whatsapp && !c.phone)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter the phone number for WhatsApp.",
      });
  });

export const CONTACT_ROLE_LABELS = {
  billing: "Accounts",
  admin: "Admin",
  legal: "Legal",
  other: "Other",
} as const;

/**
 * The tenant's stored settings with "Payment reminders" from the tenant form:
 * "true" or "false" sets `reminders.autoSend` for this tenant; blank follows
 * the business setting again. Other stored keys are kept.
 */
export function withAutoSend(
  stored: StoredSettings,
  choice: string,
): StoredSettings {
  const rest = { ...stored };
  delete rest["reminders.autoSend"];
  return choice === "true" || choice === "false"
    ? { ...rest, "reminders.autoSend": choice === "true" }
    : rest;
}
