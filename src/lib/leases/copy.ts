// "Copy an existing lease as a template": a new draft with the source
// lease's terms but none of what belongs to that tenant and those dates.

import type { EscalationRule } from "@/lib/billing/types";
import type { ChargeDraft } from "@/lib/settings/charge-defaults";

export type LeaseTemplateSource = {
  buildingId: string;
  areaBasis: "carpet" | "chargeable";
  noticePeriodMonths: number | null;
  rentFreeMonths: number;
  rentFreeDays: number;
  settings: Record<string, unknown>;
  charges: ChargeDraft[];
  escalationRules: EscalationRule[];
};

export type LeaseTemplate = Omit<LeaseTemplateSource, "charges"> & {
  /** Charges without ids or dates: they start and end with the new lease. */
  charges: Omit<ChargeDraft, "id" | "startDate" | "endDate">[];
};

function omit<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * Keeps the building, area basis, notice period, rent-free period, lease
 * settings, charges (type, rate, frequency, timing, GST, SAC) and rent-increase
 * rules. Leaves the tenant, units, dates, lock-in, deposit and custom
 * increases to be entered: they belong to the source lease. Per-sq-ft area
 * is set again from the new units, and a custom-anchor rule keeps its rate
 * but counts from the new lease start.
 */
export function leaseTemplate(source: LeaseTemplateSource): LeaseTemplate {
  return {
    buildingId: source.buildingId,
    areaBasis: source.areaBasis,
    noticePeriodMonths: source.noticePeriodMonths,
    rentFreeMonths: source.rentFreeMonths,
    rentFreeDays: source.rentFreeDays,
    settings: { ...source.settings },
    charges: source.charges.map((charge) => {
      const rest = omit(charge, ["id", "startDate", "endDate"] as const);
      return rest.basis === "per_sqft" ? { ...rest, areaHundredths: 0 } : rest;
    }),
    escalationRules: source.escalationRules.map((rule) => {
      if (rule.anchor !== "custom") return { ...rule };
      return {
        ...omit(rule, ["anchorDate"] as const),
        anchor: "lease_start" as const,
      };
    }),
  };
}
