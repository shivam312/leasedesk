// The whole lease form, checked and turned into the billing engine's lease
// (docs/PRODUCT_PLAN.md, lease setup). The form sends plain strings; the
// review step and saving both go through here, so what's reviewed is what's
// saved. No money is calculated here: the engine does that from this input.

import type { z } from "zod";
import { rentCommencement } from "@/lib/billing/rent-free";
import type { LeaseInput } from "@/lib/billing/schedule";
import type { BillingSettings, EscalationRule } from "@/lib/billing/types";
import { billingSettings } from "@/lib/settings/billing";
import {
  withBuildingDefaults,
  type SavedCharge,
} from "@/lib/settings/charge-defaults";
import { readSettingsForm, rupeesToPaise } from "@/lib/settings/rules-form";
import {
  keysForScope,
  type Settings,
  type StoredSettings,
} from "@/lib/settings/schema";
import { compareDates } from "@/lib/billing/dates";
import {
  CHARGE_ENDS_BEFORE_START,
  chargeRowSchema,
  escalationRuleSchema,
  toChargeDraft,
  type ChargeRow,
} from "./charges-form";
import { datesSchema, partiesSchema, type LeaseDates } from "./forms";

/** What the lease form sends: every field as typed. */
export type LeaseFormInput = {
  tenantId: string;
  buildingId: string;
  unitIds: string[];
  areaBasis: string;
  startDate: string;
  endDate: string;
  lockInEndDate: string;
  noticePeriodMonths: string;
  rentFree: string;
  rentFreeLength: string;
  deposit: string;
  charges: Record<string, string | boolean>[];
  rules: Record<string, string | boolean>[];
  /** Lease-level settings under "More options", keyed by fieldName(). */
  settings: Record<string, string>;
};

export const LEASE_FORM_STEPS = [
  "parties",
  "dates",
  "charges",
  "review",
] as const;
export type LeaseFormStep = (typeof LEASE_FORM_STEPS)[number];

export type LeaseDraft = {
  parties: z.output<typeof partiesSchema>;
  dates: LeaseDates;
  depositPaise: number;
  charges: ChargeRow[];
  rules: EscalationRule[];
  settings: StoredSettings;
};

/** Field errors keyed like "endDate", "charges.0.amount", "settings.<field>". */
export type LeaseFormErrors = Record<string, string>;

export type ParsedLeaseForm =
  | { ok: true; draft: LeaseDraft }
  | { ok: false; errors: LeaseFormErrors; step: LeaseFormStep };

const PARTIES_FIELDS = new Set([
  "tenantId",
  "buildingId",
  "unitIds",
  "areaBasis",
]);

// A charge row's optional text fields: one the form leaves out is blank.
const BLANK_CHARGE_TEXT = {
  slots: "",
  startDate: "",
  endDate: "",
  gstRate: "",
  sacCode: "",
  label: "",
};

function stepOf(key: string): LeaseFormStep {
  const field = key.split(".")[0]!;
  if (PARTIES_FIELDS.has(field)) return "parties";
  if (field === "charges" || field === "rules" || field === "settings")
    return "charges";
  return "dates";
}

function collect<S extends z.ZodType>(
  schema: S,
  value: unknown,
  errors: LeaseFormErrors,
  prefix = "",
): z.output<S> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const key = prefix + (issue.path.map(String).join(".") || "");
    const at = key.endsWith(".") ? key.slice(0, -1) : key;
    errors[at] ??= issue.message;
  }
  return null;
}

export function parseLeaseForm(input: LeaseFormInput): ParsedLeaseForm {
  const errors: LeaseFormErrors = {};
  const parties = collect(partiesSchema, input, errors);
  const dates = collect(datesSchema, input, errors);

  let depositPaise = 0;
  if (input.deposit.trim() !== "") {
    const paise = rupeesToPaise(input.deposit.trim().replace(/,/g, ""));
    if (paise === null)
      errors.deposit =
        "Enter the deposit in rupees, like 6,00,000, or leave it blank.";
    else depositPaise = paise;
  }

  const charges = input.charges.map((row, i) =>
    collect(
      chargeRowSchema,
      { ...BLANK_CHARGE_TEXT, ...row },
      errors,
      `charges.${i}.`,
    ),
  );
  // A charge with a blank start starts with the lease.
  if (dates)
    charges.forEach((c, i) => {
      if (
        c &&
        c.startDate === null &&
        c.endDate !== null &&
        compareDates(c.endDate, dates.startDate) < 0
      )
        errors[`charges.${i}.endDate`] ??= CHARGE_ENDS_BEFORE_START;
    });
  if (input.charges.length === 0)
    errors.charges = "Add the rent, or another charge.";
  const rules = input.rules.map((row, i) =>
    collect(escalationRuleSchema, row, errors, `rules.${i}.`),
  );
  if (input.rules.length > 0 && !input.charges.some((c) => c.type === "rent"))
    errors.rules =
      "Rent increases need a rent charge. Add the rent, or remove the increase.";

  const form = new FormData();
  for (const [k, v] of Object.entries(input.settings)) form.set(k, v);
  const settings = readSettingsForm("lease", keysForScope("lease"), form);
  if ("errors" in settings)
    for (const [k, v] of Object.entries(settings.errors))
      errors[`settings.${k}`] = v;

  const keys = Object.keys(errors);
  if (keys.length > 0) {
    const steps = keys.map(stepOf);
    const step = LEASE_FORM_STEPS.find((s) => steps.includes(s))!;
    return { ok: false, errors, step };
  }
  return {
    ok: true,
    draft: {
      parties: parties!,
      dates: dates!,
      depositPaise,
      charges: charges as ChargeRow[],
      rules: rules as EscalationRule[],
      settings: "values" in settings ? settings.values : {},
    },
  };
}

export type BuiltLease = {
  lease: LeaseInput & {
    lockInEndDate: string | null;
    noticePeriodMonths: number | null;
    charges: SavedCharge[];
  };
  /** Each unit's area on the lease's basis, copied into lease_units. */
  unitAreas: { unitId: string; area: number }[];
  areaHundredths: number;
  rentCommencementDate: string;
  billing: BillingSettings;
};

/**
 * The engine's lease for a checked draft. `units` are the building's units
 * (areas in hundredths of a sq ft); `settings` are resolved for the
 * building, tenant and this lease's own settings. `chargeIds` name the
 * charges when saving; the review step can leave them out.
 */
export function leaseInputFor(
  draft: LeaseDraft,
  ctx: {
    id: string;
    units: { id: string; carpetArea: number; chargeableArea: number }[];
    settings: Settings;
    chargeIds?: string[];
  },
): BuiltLease {
  const unitAreas = draft.parties.unitIds.map((unitId) => {
    const unit = ctx.units.find((u) => u.id === unitId);
    if (!unit)
      throw new Error("One of the chosen units isn't in this building.");
    return {
      unitId,
      area:
        draft.parties.areaBasis === "carpet"
          ? unit.carpetArea
          : unit.chargeableArea,
    };
  });
  const areaHundredths = unitAreas.reduce((sum, u) => sum + u.area, 0);
  const { startDate, endDate, rentFreeMonths, rentFreeDays } = draft.dates;
  const billing = billingSettings(ctx.settings);
  const terms = {
    id: ctx.id,
    startDate,
    endDate,
    rentFreeMonths,
    rentFreeDays,
  };
  const charges = draft.charges.map((row, i) =>
    withBuildingDefaults(
      toChargeDraft(row, ctx.chargeIds?.[i] ?? `charge-${i}`, {
        startDate,
        endDate,
        areaHundredths,
      }),
      ctx.settings,
    ),
  );
  return {
    lease: {
      ...terms,
      lockInEndDate: draft.dates.lockInEndDate,
      noticePeriodMonths: draft.dates.noticePeriodMonths,
      charges,
      escalationRules: draft.rules,
    },
    unitAreas,
    areaHundredths,
    rentCommencementDate: rentCommencement(terms, billing).date,
    billing,
  };
}
