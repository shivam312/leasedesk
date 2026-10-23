// Between the billing engine's types and the lease tables. A per-sq-ft
// charge doesn't store its area: it's the sum of the lease units' areas.

import type { LeaseInput } from "@/lib/billing/schedule";
import type { CustomEscalation, EscalationRule } from "@/lib/billing/types";
import type { SavedCharge } from "@/lib/settings/charge-defaults";

export type ChargeRowValues = {
  id: string;
  type: SavedCharge["type"];
  basis: SavedCharge["basis"];
  rateOrAmount: number;
  quantity: number | null;
  startDate: string;
  endDate: string | null;
  frequency: "monthly" | "quarterly";
  timing: "advance" | "arrears";
  gstRateBp: number;
  sacCode: string;
  waivedDuringRentFree: boolean;
  label: string | null;
};

export function chargeToRow(c: SavedCharge): ChargeRowValues {
  return {
    id: c.id,
    type: c.type,
    basis: c.basis,
    rateOrAmount: c.basis === "fixed" ? c.amountPaise : c.ratePaise,
    quantity: c.basis === "per_slot" ? c.slots : null,
    startDate: c.startDate,
    endDate: c.endDate ?? null,
    frequency: c.frequency ?? "monthly",
    timing: c.timing,
    gstRateBp: c.gstRateBp,
    sacCode: c.sacCode,
    waivedDuringRentFree: c.waivedDuringRentFree ?? c.type === "rent",
    label: c.label ?? null,
  };
}

export function rowToCharge(
  r: ChargeRowValues,
  areaHundredths: number,
): SavedCharge {
  const common = {
    id: r.id,
    type: r.type,
    ...(r.label ? { label: r.label } : {}),
    startDate: r.startDate,
    ...(r.endDate ? { endDate: r.endDate } : {}),
    frequency: r.frequency,
    timing: r.timing,
    gstRateBp: r.gstRateBp,
    sacCode: r.sacCode,
    waivedDuringRentFree: r.waivedDuringRentFree,
  };
  switch (r.basis) {
    case "fixed":
      return { ...common, basis: "fixed", amountPaise: r.rateOrAmount };
    case "per_sqft":
      return {
        ...common,
        basis: "per_sqft",
        ratePaise: r.rateOrAmount,
        areaHundredths,
      };
    case "per_slot":
      return {
        ...common,
        basis: "per_slot",
        ratePaise: r.rateOrAmount,
        slots: r.quantity ?? 0,
      };
  }
}

export type RuleRowValues = {
  chargeIds: string[] | null;
  percentBp: number;
  everyMonths: number;
  anchor: EscalationRule["anchor"];
  anchorDate: string | null;
  compounding: boolean;
};

export function ruleToRow(r: EscalationRule): RuleRowValues {
  return {
    chargeIds: Array.isArray(r.appliesTo) ? r.appliesTo : null,
    percentBp: r.percentBp,
    everyMonths: r.everyMonths,
    anchor: r.anchor,
    anchorDate: r.anchorDate ?? null,
    compounding: r.compounding ?? true,
  };
}

export function rowToRule(r: RuleRowValues): EscalationRule {
  return {
    percentBp: r.percentBp,
    everyMonths: r.everyMonths,
    anchor: r.anchor,
    ...(r.anchorDate ? { anchorDate: r.anchorDate } : {}),
    compounding: r.compounding,
    ...(r.chargeIds ? { appliesTo: r.chargeIds } : {}),
  };
}

export type CustomRowValues = {
  chargeId: string;
  effectiveDate: string;
  newAmount: number | null;
  percentBp: number | null;
};

export function rowToCustom(r: CustomRowValues): CustomEscalation {
  return {
    chargeId: r.chargeId,
    effectiveDate: r.effectiveDate,
    ...(r.newAmount !== null ? { newAmountPaise: r.newAmount } : {}),
    ...(r.percentBp !== null ? { percentBp: r.percentBp } : {}),
  };
}

/** A saved lease as the engine's input. */
export function savedLeaseInput(
  lease: {
    id: string;
    startDate: string;
    endDate: string;
    rentFreeMonths: number;
    rentFreeDays: number;
  },
  units: { area: number }[],
  charges: ChargeRowValues[],
  rules: RuleRowValues[],
  customs: CustomRowValues[],
): LeaseInput {
  const area = units.reduce((sum, u) => sum + u.area, 0);
  return {
    id: lease.id,
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentFreeMonths: lease.rentFreeMonths,
    rentFreeDays: lease.rentFreeDays,
    charges: charges.map((c) => rowToCharge(c, area)),
    escalationRules: rules.map(rowToRule),
    customEscalations: customs.map(rowToCustom),
  };
}
