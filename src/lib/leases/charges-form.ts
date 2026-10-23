// Validation for the lease form's charges and rent-increase steps. A blank
// timing, GST rate or SAC code stays blank here; withBuildingDefaults fills
// it from the building when the lease is saved (D16). Money is entered in
// rupees (commas allowed, "1,25,000.50") and stored in paise.

import { z } from "zod";
import { compareDates, parseDate } from "@/lib/billing/dates";
import type { EscalationRule } from "@/lib/billing/types";
import type { ChargeDraft } from "@/lib/settings/charge-defaults";
import { percentToBp, rupeesToPaise } from "@/lib/settings/rules-form";

const blankToNull = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s));

const isPlainDate = (s: string) => {
  try {
    parseDate(s);
    return true;
  } catch {
    return false;
  }
};

const rupees = (message: string) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const paise = rupeesToPaise(s.replace(/,/g, ""));
      if (paise === null) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return paise;
    });

const percent = (message: string, { allowZero }: { allowZero: boolean }) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const bp = percentToBp(s);
      if (bp === null || bp > 10000 || (!allowZero && bp === 0)) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return bp;
    });

export const CHARGE_ENDS_BEFORE_START = "A charge can't end before it starts.";

/** One charge row. Dates default to the lease's own when left blank. */
export const chargeRowSchema = z
  .object({
    type: z.enum(["rent", "cam", "parking", "utilities", "signage", "other"]),
    basis: z.enum(["fixed", "per_sqft", "per_slot"]),
    amount: rupees("Enter the amount in rupees, like 85.50 or 1,25,000."),
    slots: blankToNull,
    startDate: blankToNull.refine(
      (s) => s === null || isPlainDate(s),
      "Enter the date this charge starts, or leave it blank.",
    ),
    endDate: blankToNull.refine(
      (s) => s === null || isPlainDate(s),
      "Enter the date this charge ends, or leave it blank.",
    ),
    frequency: z.enum(["monthly", "quarterly"]).default("monthly"),
    timing: z.enum(["", "advance", "arrears"]).default(""),
    gstRate: blankToNull,
    sacCode: blankToNull.refine(
      (s) => s === null || /^\d{6}$/.test(s),
      "A SAC code is 6 digits, like 997212.",
    ),
    label: blankToNull,
    waivedDuringRentFree: z.boolean().optional(),
  })
  .transform((row, ctx) => {
    // A blank start is the lease's; parseLeaseForm checks the end against it.
    if (
      row.startDate !== null &&
      row.endDate !== null &&
      compareDates(row.endDate, row.startDate) < 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: CHARGE_ENDS_BEFORE_START,
      });
      return z.NEVER;
    }
    let slots: number | null = null;
    if (row.basis === "per_slot") {
      slots = row.slots && /^\d+$/.test(row.slots) ? Number(row.slots) : 0;
      if (slots < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["slots"],
          message: "Enter the number of parking slots, like 2.",
        });
        return z.NEVER;
      }
    }
    let gstRateBp: number | undefined;
    if (row.gstRate !== null) {
      const bp = percentToBp(row.gstRate);
      if (bp === null || bp > 10000) {
        ctx.addIssue({
          code: "custom",
          path: ["gstRate"],
          message:
            "Enter the GST rate as a percentage, like 18, or leave it blank.",
        });
        return z.NEVER;
      }
      gstRateBp = bp;
    }
    return { ...row, slots, gstRateBp };
  });

export type ChargeRow = z.output<typeof chargeRowSchema>;

/**
 * A charge row as the billing engine's draft charge. Blank dates take the
 * lease's; rent is waived during the rent-free period unless the row says
 * otherwise, other charges aren't (docs/BILLING_RULES.md section 4).
 */
export function toChargeDraft(
  row: ChargeRow,
  id: string,
  lease: { startDate: string; endDate: string; areaHundredths: number },
): ChargeDraft {
  const common = {
    id,
    type: row.type,
    ...(row.label ? { label: row.label } : {}),
    startDate: row.startDate ?? lease.startDate,
    ...(row.endDate ? { endDate: row.endDate } : {}),
    frequency: row.frequency,
    ...(row.timing ? { timing: row.timing } : {}),
    ...(row.gstRateBp !== undefined ? { gstRateBp: row.gstRateBp } : {}),
    ...(row.sacCode ? { sacCode: row.sacCode } : {}),
    waivedDuringRentFree: row.waivedDuringRentFree ?? row.type === "rent",
  };
  switch (row.basis) {
    case "fixed":
      return { ...common, basis: "fixed", amountPaise: row.amount };
    case "per_sqft":
      return {
        ...common,
        basis: "per_sqft",
        ratePaise: row.amount,
        areaHundredths: lease.areaHundredths,
      };
    case "per_slot":
      return {
        ...common,
        basis: "per_slot",
        ratePaise: row.amount,
        slots: row.slots ?? 0,
      };
  }
}

/** A rent-increase rule: "5% every 12 months". */
export const escalationRuleSchema = z
  .object({
    percent: percent("Enter the increase as a percentage, like 5.", {
      allowZero: false,
    }),
    everyMonths: z
      .string()
      .trim()
      .refine(
        (s) => /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 600,
        "Enter how often rent increases, in months, like 12.",
      )
      .transform(Number),
    anchor: z
      .enum(["lease_start", "rent_commencement", "custom"])
      .default("lease_start"),
    anchorDate: blankToNull.default(""),
    compounding: z.boolean().default(true),
  })
  .transform((v, ctx): EscalationRule => {
    if (
      v.anchor === "custom" &&
      (v.anchorDate === null || !isPlainDate(v.anchorDate))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["anchorDate"],
        message: "Enter the date the increases count from.",
      });
      return z.NEVER;
    }
    return {
      percentBp: v.percent,
      everyMonths: v.everyMonths,
      anchor: v.anchor,
      ...(v.anchor === "custom" && v.anchorDate
        ? { anchorDate: v.anchorDate }
        : {}),
      compounding: v.compounding,
    };
  });
