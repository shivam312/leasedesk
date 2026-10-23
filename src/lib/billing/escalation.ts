import { chargeBaseAmount } from "./charges";
import { addMonths, compareDates } from "./dates";
import type { PlainDate } from "./dates";
import { percent, rupees } from "./explain";
import { formatDate } from "@/lib/format";
import { increaseByPercent, increaseByPercentToRupee } from "./money";
import { rentCommencement } from "./rent-free";
import type {
  AmountStep,
  BillingSettings,
  Charge,
  CustomEscalation,
  EscalationRule,
  LeaseTerms,
} from "./types";

type Event =
  | {
      kind: "rule";
      date: PlainDate;
      rule: EscalationRule;
      count: number;
      /** Set when the rule restarted from a custom increase on this date. */
      resumedFrom?: PlainDate;
    }
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
  settings,
}: {
  charge: Charge;
  lease: LeaseTerms;
  rules?: EscalationRule[];
  custom?: CustomEscalation[];
  settings: Pick<
    BillingSettings,
    "roundIncreasedRent" | "monthEndRule" | "afterCustomIncrease"
  >;
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
  // Two entries on one date would make the input order decide the rent.
  customs.forEach((entry, i) => {
    if (i > 0 && customs[i - 1]?.effectiveDate === entry.effectiveDate) {
      throw new Error(
        `Lease ${lease.id}: charge ${charge.id} has more than one custom rent increase on ${entry.effectiveDate}`,
      );
    }
  });
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
    const anchor = ruleAnchor(rule, lease, settings);
    const compounding = rule.compounding ?? true;
    ruleIntro = compounding
      ? `${noun} goes up ${percent(rule.percentBp)} every ${rule.everyMonths} months from ${formatDate(anchor)}`
      : `${noun} goes up ${percent(rule.percentBp)} of the starting amount every ${rule.everyMonths} months from ${formatDate(anchor)}`;
    let count = 0;
    for (let k = 1; ; k++) {
      const date = addMonths(
        anchor,
        k * rule.everyMonths,
        settings.monthEndRule,
      );
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
  // billing.afterCustomIncrease = resume_rule (D-002): after each custom
  // increase the rule starts again, counted from that date, until the next
  // custom increase. A resumed increase is never sooner than a full interval
  // after the custom one, nor before the rule's own first increase date.
  if (rule && settings.afterCustomIncrease === "resume_rule") {
    const firstRuleDate = addMonths(
      ruleAnchor(rule, lease, settings),
      rule.everyMonths,
      settings.monthEndRule,
    );
    const inForceCustoms = customs.filter((c) => inForce(c.effectiveDate));
    inForceCustoms.forEach((entry, i) => {
      const next = inForceCustoms[i + 1]?.effectiveDate;
      let count = 0;
      for (let k = 1; ; k++) {
        const date = addMonths(
          entry.effectiveDate,
          k * rule.everyMonths,
          settings.monthEndRule,
        );
        if (!inForce(date)) break;
        if (next && compareDates(date, next) >= 0) break;
        if (compareDates(date, firstRuleDate) < 0) continue;
        count += 1;
        events.push({
          kind: "rule",
          date,
          rule,
          count,
          resumedFrom: entry.effectiveDate,
        });
      }
    });
  }
  events.sort((a, b) => compareDates(a.date, b.date));

  const steps: AmountStep[] = [
    {
      from: charge.startDate,
      amount: base.amount,
      explanation: base.explanation,
    },
  ];
  // Escalated rent is rounded to the rupee (section 2); everything else to
  // the paisa. Either way each step is rounded exactly once.
  const toRupee =
    charge.type === "rent" && settings.roundIncreasedRent === "rupee";
  const raise = (amount: number, bp: number) =>
    toRupee
      ? increaseByPercentToRupee(amount, bp)
      : increaseByPercent(amount, bp);
  const rounding = toRupee ? ", to the nearest rupee" : "";
  const change = (from: number, bp: number) =>
    bp < 0
      ? `${rupees(from)} − ${percent(-bp)}`
      : `${rupees(from)} + ${percent(bp)}`;

  let previous = base.amount;
  // The amount set by the latest custom increase: a resumed non-compounding
  // rule counts its steps from it.
  let customAmount = base.amount;
  for (const event of events) {
    const on = formatDate(event.date);
    const lines: string[] = [];
    let amount: number;
    let word: string;

    if (event.kind === "rule") {
      const { rule: r, count, resumedFrom } = event;
      if (resumedFrom) {
        lines.push(
          `${noun} goes up ${percent(r.percentBp)} every ${r.everyMonths} months again from the change on ${formatDate(resumedFrom)}`,
        );
      } else if (ruleIntro) lines.push(ruleIntro);
      const start = resumedFrom ? customAmount : base.amount;
      if (r.compounding ?? true) {
        amount = raise(previous, r.percentBp);
        word = amount < previous ? "decrease" : "increase";
        lines.push(
          `${noun} ${word} on ${on}: ${change(previous, r.percentBp)}${rounding} = ${rupees(amount)}`,
        );
      } else {
        amount = raise(start, count * r.percentBp);
        word = amount < previous ? "decrease" : "increase";
        lines.push(
          `${noun} ${word} on ${on}: ${rupees(start)} + ${count} × ${percent(r.percentBp)}${rounding} = ${rupees(amount)}`,
        );
      }
    } else if (event.entry.newAmountPaise !== undefined) {
      // An agreed amount is used exactly as entered, never rounded.
      amount = event.entry.newAmountPaise;
      word = amount < previous ? "decrease" : "increase";
      lines.push(
        `${noun} ${amount < previous ? "decreases" : "changes"} on ${on} to the agreed ${rupees(amount)}`,
      );
    } else {
      const bp = event.entry.percentBp ?? 0;
      amount = raise(previous, bp);
      word = amount < previous ? "decrease" : "increase";
      lines.push(
        `${noun} ${word} on ${on}: ${change(previous, bp)}${rounding} = ${rupees(amount)}`,
      );
    }

    if (event.kind === "custom") customAmount = amount;
    steps.push({
      from: event.date,
      amount,
      explanation: {
        rule: `Rent ${word}`,
        steps: lines,
        result: amount,
      },
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

function ruleAnchor(
  rule: EscalationRule,
  lease: LeaseTerms,
  settings: Pick<BillingSettings, "monthEndRule">,
): PlainDate {
  switch (rule.anchor) {
    case "lease_start":
      return lease.startDate;
    case "rent_commencement":
      return rentCommencement(lease, settings).date;
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
