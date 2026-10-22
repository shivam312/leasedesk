import { hundredths, rupees } from "./explain";
import { perUnitMonthly, mulDiv } from "./money";
import type { Charge, Explained } from "./types";

export type ChargeWithDefaults = Charge &
  Required<Pick<Charge, "frequency" | "timing" | "waivedDuringRentFree">>;

/** Defaults from docs/BILLING_RULES.md section 3. */
export function withChargeDefaults(charge: Charge): ChargeWithDefaults {
  return {
    ...charge,
    frequency: charge.frequency ?? "monthly",
    timing: charge.timing ?? "advance",
    waivedDuringRentFree: charge.waivedDuringRentFree ?? charge.type === "rent",
  };
}

/**
 * The charge's amount for one full billing period, before any rent increase:
 * per month, or per quarter for quarterly charges (a fixed amount is taken
 * as per quarter; a per sq ft or per slot rate gives the monthly amount × 3).
 */
export function chargeBaseAmount(charge: Charge): Explained {
  const frequency = charge.frequency ?? "monthly";
  const per = frequency === "quarterly" ? "per quarter" : "per month";

  if (charge.basis === "fixed") {
    assertNonNegative(charge.amountPaise, "Amount", charge.id);
    return explained(charge.amountPaise, "Fixed amount", [
      `Fixed amount: ${rupees(charge.amountPaise)} ${per}`,
    ]);
  }

  const monthly = monthlyFromRate(charge);
  if (frequency === "monthly") return monthly;

  // Rates are per month (section 1); a quarterly bill is the monthly amount × 3.
  const amount = mulDiv(monthly.amount, 3, 1);
  return explained(amount, `${monthly.explanation.rule}, quarterly`, [
    ...monthly.explanation.steps,
    `${rupees(monthly.amount)} × 3 months = ${rupees(amount)} per quarter`,
  ]);
}

/** Monthly amount for a per sq ft or per slot charge (sections 1 and 3). */
function monthlyFromRate(
  charge: Extract<Charge, { basis: "per_sqft" | "per_slot" }>,
): Explained {
  if (charge.basis === "per_sqft") {
    assertNonNegative(charge.ratePaise, "Rate", charge.id);
    assertPositiveInteger(charge.areaHundredths, "Area", charge.id);
    const amount = perUnitMonthly(charge.ratePaise, charge.areaHundredths);
    return explained(amount, "Rate per sq ft × area", [
      `${hundredths(charge.areaHundredths)} sq ft × ${rupees(charge.ratePaise)} = ${rupees(amount)} per month`,
    ]);
  }

  assertNonNegative(charge.ratePaise, "Rate", charge.id);
  assertPositiveInteger(charge.slots, "Slots", charge.id);
  const amount = mulDiv(charge.ratePaise, charge.slots, 1);
  return explained(amount, "Rate per slot × slots", [
    `${charge.slots} ${charge.slots === 1 ? "slot" : "slots"} × ${rupees(charge.ratePaise)} = ${rupees(amount)} per month`,
  ]);
}

function explained(amount: number, rule: string, steps: string[]): Explained {
  return { amount, explanation: { rule, steps, result: amount } };
}

function assertNonNegative(value: number, name: string, id: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `Charge ${id}: ${name} must be a whole number of paise ≥ 0, got ${value}`,
    );
  }
}

function assertPositiveInteger(value: number, name: string, id: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      `Charge ${id}: ${name} must be a positive whole number, got ${value}`,
    );
  }
}
