// Starting values for the lease form: blank, a copied lease (template) or a
// renewal. Paise and basis points become the text the user would type.

import { addDays, addMonths, type PlainDate } from "@/lib/billing/dates";
import type { EscalationRule } from "@/lib/billing/types";
import type { ChargeDraft } from "@/lib/settings/charge-defaults";
import { fieldName, toFieldValue } from "@/lib/settings/rules-form";
import type { SettingKey } from "@/lib/settings/schema";
import type { LeaseTemplate } from "./copy";
import type { LeaseFormInput } from "./draft";

/** 1_25_000_50 paise → "125000.50"; whole rupees have no decimals. */
export function paiseText(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest === 0
    ? String(rupees)
    : `${rupees}.${String(rest).padStart(2, "0")}`;
}

/** 500 bp → "5"; 1250 → "12.5". */
export function bpText(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = bp % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}

export const BLANK_CHARGE: Record<string, string | boolean> = {
  type: "rent",
  basis: "per_sqft",
  amount: "",
  slots: "",
  startDate: "",
  endDate: "",
  frequency: "monthly",
  timing: "",
  gstRate: "",
  sacCode: "",
  label: "",
};

export const BLANK_RULE: Record<string, string | boolean> = {
  percent: "",
  everyMonths: "12",
  anchor: "lease_start",
  anchorDate: "",
  compounding: true,
};

export function blankLeaseForm(): LeaseFormInput {
  return {
    tenantId: "",
    buildingId: "",
    unitIds: [],
    areaBasis: "chargeable",
    startDate: "",
    endDate: "",
    lockInEndDate: "",
    noticePeriodMonths: "",
    rentFree: "none",
    rentFreeLength: "",
    deposit: "",
    charges: [{ ...BLANK_CHARGE }],
    rules: [],
    settings: {},
  };
}

// Omit<> over the ChargeDraft union keeps only the shared fields; a
// template charge still holds its basis's own amount fields.
type ChargeLike = Omit<ChargeDraft, "id" | "startDate" | "endDate">;

function chargeText(charge: ChargeLike, keepDates: boolean) {
  const c = charge as ChargeDraft;
  const amount = c.basis === "fixed" ? c.amountPaise : c.ratePaise;
  return {
    type: c.type,
    basis: c.basis,
    amount: paiseText(amount),
    slots: c.basis === "per_slot" ? String(c.slots) : "",
    startDate: keepDates ? (c.startDate ?? "") : "",
    endDate: keepDates ? (c.endDate ?? "") : "",
    frequency: c.frequency ?? "monthly",
    timing: c.timing ?? "",
    gstRate: c.gstRateBp === undefined ? "" : bpText(c.gstRateBp),
    sacCode: c.sacCode ?? "",
    label: c.label ?? "",
    waivedDuringRentFree: c.waivedDuringRentFree ?? c.type === "rent",
  };
}

function ruleText(r: EscalationRule) {
  return {
    percent: bpText(r.percentBp),
    everyMonths: String(r.everyMonths),
    anchor: r.anchor,
    anchorDate: r.anchorDate ?? "",
    compounding: r.compounding ?? true,
  };
}

/**
 * The form filled from a copied lease or a renewal draft. A copy leaves the
 * tenant, units and dates blank; a renewal (with `tenantId` and dates) keeps
 * them.
 */
export function leaseFormFrom(
  template: LeaseTemplate & {
    tenantId?: string;
    unitIds?: string[];
    startDate?: string;
    endDate?: string;
  },
): LeaseFormInput {
  const rentFree =
    template.rentFreeMonths > 0
      ? "months"
      : template.rentFreeDays > 0
        ? "days"
        : "none";
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(template.settings))
    settings[fieldName(key as SettingKey)] = toFieldValue(
      key as SettingKey,
      value,
    );
  return {
    ...blankLeaseForm(),
    tenantId: template.tenantId ?? "",
    buildingId: template.buildingId,
    unitIds: template.unitIds ?? [],
    areaBasis: template.areaBasis,
    startDate: template.startDate ?? "",
    endDate: template.endDate ?? "",
    noticePeriodMonths:
      template.noticePeriodMonths === null
        ? ""
        : String(template.noticePeriodMonths),
    rentFree,
    rentFreeLength:
      rentFree === "months"
        ? String(template.rentFreeMonths)
        : rentFree === "days"
          ? String(template.rentFreeDays)
          : "",
    charges: template.charges.map((c) => chargeText(c, false)),
    rules: template.escalationRules.map(ruleText),
    settings,
  };
}

/** Lease terms the dates step offers as a last day, in years. */
export const SUGGESTED_TERMS = [3, 5, 9] as const;

/**
 * The last day of a lease of `years` from `start`: the day before the
 * anniversary, so a lease from 01-11-2026 for 9 years ends on 31-10-2035
 * (not 01-11-2035, which would bill a day of a tenth year). A start on
 * 29 February rolls to 1 March, so the lease ends on 28 February.
 */
export function lastDayAfterYears(start: PlainDate, years: number): PlainDate {
  return addDays(addMonths(start, years * 12, "roll_forward"), -1);
}
