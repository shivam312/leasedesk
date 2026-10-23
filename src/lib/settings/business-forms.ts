// Validation for Settings → Business details: the organization and its
// billing entities (the GSTINs invoices are issued from). Messages are shown
// to users as they are.

import { z } from "zod";
import {
  GST_STATES,
  gstinProblem,
  isValidIfsc,
  isValidPan,
  isValidUpiId,
  normalizeId,
} from "@/lib/india/identifiers";

/** "" → null, so blank optional fields are stored as empty. */
const optional = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .pipe(schema.nullable());

const pan = optional(
  z
    .string()
    .transform(normalizeId)
    .refine(
      isValidPan,
      "A PAN is 5 letters, 4 digits and a letter, like AABCD1234E.",
    ),
);

export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the name your tenants know you by.")
    .max(120, "Keep the name under 120 characters."),
  legalName: optional(
    z.string().max(200, "Keep the legal name under 200 characters."),
  ),
  pan,
});

export const billingEntitySchema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(2, "Enter the legal name on your GST registration."),
    gstin: optional(
      z
        .string()
        .transform(normalizeId)
        .superRefine((value, ctx) => {
          const problem = gstinProblem(value);
          if (problem) ctx.addIssue({ code: "custom", message: problem });
        }),
    ),
    stateCode: z
      .string()
      .refine((s) => s in GST_STATES, "Choose the state you're registered in."),
    address: z
      .string()
      .trim()
      .min(5, "Enter the address printed on your invoices."),
    bankName: optional(z.string().max(100)),
    bankAccountName: optional(z.string().max(100)),
    bankAccountNumber: optional(
      z
        .string()
        .transform((s) => s.replace(/\s+/g, ""))
        .refine(
          (s) => /^\d{9,18}$/.test(s),
          "An account number is 9 to 18 digits.",
        ),
    ),
    ifsc: optional(
      z
        .string()
        .transform(normalizeId)
        .refine(isValidIfsc, "An IFSC is 11 characters, like HDFC0000123."),
    ),
    upiId: optional(
      z.string().refine(isValidUpiId, "A UPI ID looks like name@bank."),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.gstin && value.gstin.slice(0, 2) !== value.stateCode) {
      ctx.addIssue({
        code: "custom",
        path: ["stateCode"],
        message: `This GSTIN is registered in ${GST_STATES[value.gstin.slice(0, 2)] ?? "another state"}. Choose that state.`,
      });
    }
  });

export const STATE_OPTIONS = Object.entries(GST_STATES)
  .map(([value, name]) => ({ value, label: `${name} (${value})` }))
  .sort((a, b) => a.label.localeCompare(b.label));
