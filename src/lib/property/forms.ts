// Validation for the building, floor and unit forms. Messages are shown as they are.

import { z } from "zod";
import { GST_STATES } from "@/lib/india/identifiers";

/** "1250.5" or "1,250.50" sq ft → 125050 hundredths; null if it isn't an area. */
export function sqftToHundredths(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.replace(/,/g, ""));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 125050 → "1250.50", for editing. */
export function hundredthsToSqft(value: number): string {
  const whole = Math.trunc(value / 100);
  const rest = value % 100;
  return rest === 0
    ? String(whole)
    : `${whole}.${String(rest).padStart(2, "0")}`;
}

const prefix = (what: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9/-]{0,4}$/,
      `The ${what} prefix is 1 to 5 letters or digits, like ABC.`,
    );

export const buildingSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the building's name.").max(120),
    address: z.string().trim().min(5, "Enter the building's address."),
    city: z.string().trim().min(2, "Enter the city."),
    stateCode: z
      .string()
      .refine((s) => s in GST_STATES, "Choose the state the building is in."),
    billingEntityId: z.uuid("Choose which GSTIN this building bills from."),
    invoicePrefix: prefix("invoice"),
    creditNotePrefix: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : s))
      .pipe(prefix("credit note").nullable()),
  })
  // Credit note prefix left blank: the invoice prefix and CN (ABC → ABCCN).
  .transform((b) => ({
    ...b,
    creditNotePrefix: b.creditNotePrefix ?? `${b.invoicePrefix.slice(0, 3)}CN`,
  }));

export const floorSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Enter the floor, like Ground or 3rd.")
    .max(40),
});

const area = (what: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const value = sqftToHundredths(s);
      if (value === null || value <= 0) {
        ctx.addIssue({
          code: "custom",
          message: `Enter the ${what} in sq ft, like 1250 or 1250.50.`,
        });
        return z.NEVER;
      }
      return value;
    });

export const unitSchema = z
  .object({
    code: z.string().trim().min(1, "Enter the unit number, like 301.").max(30),
    floorId: z
      .string()
      .transform((s) => (s === "" ? null : s))
      .pipe(z.uuid().nullable()),
    carpetArea: area("carpet area"),
    chargeableArea: z
      .string()
      .trim()
      .transform((s, ctx) => {
        if (s === "") return null;
        const value = sqftToHundredths(s);
        if (value === null || value <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "Enter the billed area in sq ft, like 1625 or 1625.50.",
          });
          return z.NEVER;
        }
        return value;
      }),
    status: z.enum(["vacant", "leased", "fit_out", "blocked"]),
  })
  // Billed area left blank: the same as the carpet area.
  .transform((u) => ({
    ...u,
    chargeableArea: u.chargeableArea ?? u.carpetArea,
  }));

export const UNIT_STATUS_LABELS = {
  vacant: "Vacant",
  leased: "Leased",
  fit_out: "Fit-out",
  blocked: "Not available",
} as const;
