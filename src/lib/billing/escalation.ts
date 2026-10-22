import { chargeBaseAmount } from "./charges";
import { addMonths, compareDates } from "./dates";
import type { PlainDate } from "./dates";
import { percent, rupees } from "./explain";
import { formatDate } from "@/lib/format";
import { increaseByPercent, roundToRupee } from "./money";
import { rentCommencement } from "./rent-free";
import type {
  AmountStep,
  Charge,
  CustomEscalation,
  EscalationRule,
  LeaseTerms,
} from "./types";

type Event =
  | { kind: "rule"; date: PlainDate; rule: EscalationRule; count: number }
  | { kind: "custom"; date: PlainDate; entry: CustomEscalation };

/**
 * The charge's amount over time: the base amount from the charge start, then
 * one step per rent increase (docs/BILLING_RULES.md, section 5).
 */
export function amountSteps({
  charge,
  lease,
  rules = [],
  custom = [],
  roundEscalatedRentToRupee,
}: {
  charge: Charge;
  lease: LeaseTerms;
  rules?: EscalationRule[];
  custom?: CustomEscalation[];
  /** Organization setting, section 2 (default `true` at the call site). */
  roundEscalatedRentToRupee: boolean;
}): AmountStep[] {
  const base = chargeBaseAmount(charge);
  const noun =
    charge.type === "rent"
      ? "Rent"
      : (charge.label ?? charge.type.toUpperCase());

  const applicable = rules.filter((rule) => ruleApplies(rule, charge));
  if (applicable.length > 1) {
    throw new Error(
      `Lease ${lease.id}: charge ${charge.id} has more than one rent increase rule`,
    );
  }
  const rule = applicable[0];

  const customs = custom
    .filter((entry) => entry.chargeId === charge.id)
    .map((entry) => validateCustom(entry, charge, lease))
    .sort((a, b) => compareDates(a.effectiveDate, b.effectiveDate));
  const firstCustom = customs[0]?.effectiveDate;

  // An increase applies if dated on or before the lease end and the charge
  // end: the same rule for both (section 5).
  const inForce = (date: PlainDate) =>
    compareDates(date, lease.endDate) <= 0 &&
    (!charge.endDate || compareDates(date, charge.endDate) <= 0);

  const events: Event[] = [];
  let ruleIntro: string | undefined;
  if (rule) {
    validateRule(rule, lease);
    const anchor = ruleAnchor(rule, lease);
    const compounding = rule.compounding ?? true;
    ruleIntro = compounding
      ? `${noun} goes up ${percent(rule.percentBp)} every ${rule.everyMonths} months from ${formatDate(anchor)}`
      : `${noun} goes up ${percent(rule.percentBp)} of the starting amount every ${rule.everyMonths} months from ${formatDate(anchor)}`;
    let count = 0;
    for (let k = 1; ; k++) {
      const date = addMonths(anchor, k * rule.everyMonths);
      if (!inForce(date)) break;
      if (firstCustom && compareDates(date, firstCustom) >= 0) break;
      if (compareDates(date, charge.startDate) <= 0) continue;
      count += 1;
      events.push({ kind: "rule", date, rule, count });
    }
  }
  for (const entry of customs) {
    if (inForce(entry.effectiveDate)) {
      events.push({ kind: "custom", date: entry.effectiveDate, entry });
    }
  }

  const steps: AmountStep[] = [
    {
      from: charge.startDate,
      amount: base.amount,
      explanation: base.explanation,
    },
  ];
  let previous = base.amount;
  for (const event of events) {
    const on = formatDate(event.date);
    const lines: string[] = [];
    let amount: number;
    let roundable = true;

    if (event.kind === "rule") {
      const { rule: r, count } = event;
      if (ruleIntro) lines.push(ruleIntro);
      if (r.compounding ?? true) {
        amount = increaseByPercent(previous, r.percentBp);
        lines.push(
          `${noun} increase on ${on}: ${rupees(previous)} + ${percent(r.percentBp)} = ${rupees(amount)}`,
        );
      } else {
        amount = increaseByPercent(base.amount, count * r.percentBp);
        lines.push(
          `${noun} increase on ${on}: ${rupees(base.amount)} + ${count} × ${percent(r.percentBp)} = ${rupees(amount)}`,
        );
      }
    } else if (event.entry.newAmountPaise !== undefined) {
      amount = event.entry.newAmountPaise;
      roundable = false;
      lines.push(`${noun} changes on ${on} to the agreed ${rupees(amount)}`);
    } else {
      const bp = event.entry.percentBp ?? 0;
      amount = increaseByPercent(previous, bp);
      lines.push(
        `${noun} increase on ${on}: ${rupees(previous)} + ${percent(bp)} = ${rupees(amount)}`,
      );
    }

    if (roundable && charge.type === "rent" && roundEscalatedRentToRupee) {
      const rounded = roundToRupee(amount);
      if (rounded !== amount)
        lines.push(`Rounded to the nearest rupee: ${rupees(rounded)}`);
      amount = rounded;
    }

    steps.push({
      from: event.date,
      amount,
      explanation: { rule: "Rent increase", steps: lines, result: amount },
    });
    previous = amount;
  }
  return steps;
}

function ruleApplies(rule: EscalationRule, charge: Charge): boolean {
  const appliesTo = rule.appliesTo ?? "rent";
  return appliesTo === "rent"
    ? charge.type === "rent"
    : appliesTo.includes(charge.id);
}

function ruleAnchor(rule: EscalationRule, lease: LeaseTerms): PlainDate {
  switch (rule.anchor) {
    case "lease_start":
      return lease.startDate;
    case "rent_commencement":
      return rentCommencement(lease).date;
    case "custom":
      if (!rule.anchorDate) {
        throw new Error(
          `Lease ${lease.id}: rent increase rule needs an anchor date`,
        );
      }
      return rule.anchorDate;
  }
}

function validateRule(rule: EscalationRule, lease: LeaseTerms): void {
  if (!Number.isSafeInteger(rule.everyMonths) || rule.everyMonths < 1) {
    throw new RangeError(
      `Lease ${lease.id}: rent increase interval must be at least 1 month`,
    );
  }
  if (!Number.isSafeInteger(rule.percentBp) || rule.percentBp < 0) {
    throw new RangeError(
      `Lease ${lease.id}: rent increase must be a whole number of basis points ≥ 0`,
    );
  }
}

function validateCustom(
  entry: CustomEscalation,
  charge: Charge,
  lease: LeaseTerms,
): CustomEscalation {
  const hasAmount = entry.newAmountPaise !== undefined;
  const hasPercent = entry.percentBp !== undefined;
  if (hasAmount === hasPercent) {
    throw new Error(
      `Lease ${lease.id}: custom rent increase on ${entry.effectiveDate} needs either a new amount or a percentage`,
    );
  }
  const value = hasAmount ? entry.newAmountPaise : entry.percentBp;
  if (!Number.isSafeInteger(value) || (value ?? 0) < (hasAmount ? 0 : -9_999)) {
    throw new RangeError(
      `Lease ${lease.id}: custom rent increase on ${entry.effectiveDate} is not a valid number`,
    );
  }
  if (compareDates(entry.effectiveDate, charge.startDate) <= 0) {
    throw new Error(
      `Lease ${lease.id}: custom rent increase on ${entry.effectiveDate} must be after charge ${charge.id} starts`,
    );
  }
  return entry;
}
