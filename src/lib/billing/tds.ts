import { financialYear, fyQuarter } from "./dates";
import type { PlainDate } from "./dates";
import { percent, rupees } from "./explain";
import { sumOfPercentsToPaisa, sumOfPercentsToRupee, sumPaise } from "./money";
import type { BasisPoints, Paise } from "./money";
import type { BillingSettings, ChargeType, Explained } from "./types";

/** Charge types a tenant sets TDS for (utilities and signage count as other). */
export type TdsGroup = "rent" | "cam" | "parking" | "other";

/**
 * The tenant's TDS setting per charge type, each with its own rate
 * (docs/BILLING_RULES.md, section 10) [CA].
 */
export type TenantTds = Record<
  TdsGroup,
  { deductsTds: boolean; tdsRateBp: BasisPoints }
>;

const GROUPS: { group: TdsGroup; label: string }[] = [
  { group: "rent", label: "Rent" },
  { group: "cam", label: "Maintenance (CAM)" },
  { group: "parking", label: "Parking" },
  { group: "other", label: "Other charges" },
];

/** Default: the same setting for every charge type, at 10%. */
export function tenantTdsDefaults({
  deductsTds,
}: {
  deductsTds: boolean;
}): TenantTds {
  const setting = () => ({ deductsTds, tdsRateBp: 1000 });
  return {
    rent: setting(),
    cam: setting(),
    parking: setting(),
    other: setting(),
  };
}

export function tdsGroup(type: ChargeType): TdsGroup {
  return type === "rent" || type === "cam" || type === "parking"
    ? type
    : "other";
}

/**
 * Expected TDS on an invoice: for each charge type the tenant deducts on,
 * its rate on that type's taxable value (GST excluded); the total rounded
 * once, to the rupee or the paisa (`tds.rounding`, section 10) [CA]. Rates are tenant settings,
 * never constants.
 */
export function expectedTds({
  lines,
  tds,
  settings,
}: {
  lines: readonly { chargeType: ChargeType; taxablePaise: Paise }[];
  tds: TenantTds;
  settings: Pick<BillingSettings, "tdsRounding">;
}): Explained {
  const parts: { amount: Paise; bp: BasisPoints }[] = [];
  const steps: string[] = [];
  for (const { group, label } of GROUPS) {
    const { deductsTds, tdsRateBp } = tds[group];
    if (!Number.isSafeInteger(tdsRateBp) || tdsRateBp < 0) {
      throw new RangeError(
        `TDS rate for ${label} must be whole basis points ≥ 0, got ${tdsRateBp}`,
      );
    }
    const taxable = sumPaise(
      lines
        .filter((l) => tdsGroup(l.chargeType) === group)
        .map((l) => l.taxablePaise),
    );
    if (taxable === 0) continue;
    if (!deductsTds) {
      steps.push(`${label}: no TDS on ${rupees(taxable)}`);
      continue;
    }
    parts.push({ amount: taxable, bp: tdsRateBp });
    steps.push(
      `${label}: TDS ${percent(tdsRateBp)} of ${rupees(taxable)} (GST excluded)`,
    );
  }
  if (parts.length === 0) {
    return {
      amount: 0,
      explanation: {
        rule: "No TDS",
        steps: ["This tenant doesn't deduct TDS on these charges"],
        result: 0,
      },
    };
  }
  const toRupee = settings.tdsRounding === "rupee";
  const amount = toRupee
    ? sumOfPercentsToRupee(parts)
    : sumOfPercentsToPaisa(parts);
  steps.push(
    `Expected TDS, to the nearest ${toRupee ? "rupee" : "paisa"} = ${rupees(amount)}`,
  );
  return {
    amount,
    explanation: { rule: "TDS on taxable value", steps, result: amount },
  };
}

/**
 * How one payment settles one invoice: received + TDS deducted = settled.
 * A payment short by the expected TDS (within `tds.tolerancePaise`, default
 * ₹1, inclusive) is "paid with TDS", not
 * "part-paid". Anything received above the total is excess credit.
 */
export function settlePayment({
  invoiceTotalPaise,
  receivedPaise,
  expectedTdsPaise,
  settings,
}: {
  invoiceTotalPaise: Paise;
  receivedPaise: Paise;
  expectedTdsPaise: Paise;
  settings: Pick<BillingSettings, "tdsTolerancePaise">;
}): {
  status: "paid" | "paid_with_tds" | "part_paid";
  tdsDeductedPaise: Paise;
  settledPaise: Paise;
  excessPaise: Paise;
} {
  const tolerance = settings.tdsTolerancePaise;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) {
    throw new RangeError(
      `TDS tolerance must be whole paise ≥ 0, got ${tolerance}`,
    );
  }
  const shortfall = invoiceTotalPaise - receivedPaise;
  if (shortfall <= 0) {
    return {
      status: "paid",
      tdsDeductedPaise: 0,
      settledPaise: invoiceTotalPaise,
      excessPaise: Math.max(0, -shortfall),
    };
  }
  if (
    expectedTdsPaise > 0 &&
    Math.abs(shortfall - expectedTdsPaise) <= tolerance
  ) {
    return {
      status: "paid_with_tds",
      tdsDeductedPaise: shortfall,
      settledPaise: invoiceTotalPaise,
      excessPaise: 0,
    };
  }
  return {
    status: "part_paid",
    tdsDeductedPaise: 0,
    settledPaise: receivedPaise,
    excessPaise: 0,
  };
}

/**
 * The FY quarter a TDS amount is tracked under: of the payment date (default)
 * or the invoice date (`tds.quarterBasis`, section 10) [CA].
 */
export function tdsQuarter({
  paymentDate,
  invoiceDate,
  settings,
}: {
  paymentDate: PlainDate;
  invoiceDate: PlainDate;
  settings: Pick<BillingSettings, "tdsQuarterBasis">;
}): {
  financialYear: string;
  quarter: 1 | 2 | 3 | 4;
} {
  const date =
    settings.tdsQuarterBasis === "invoice_date" ? invoiceDate : paymentDate;
  return {
    financialYear: financialYear(date).label,
    quarter: fyQuarter(date).quarter,
  };
}
