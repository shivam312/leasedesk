import { financialYear, fyQuarter } from "./dates";
import type { PlainDate } from "./dates";
import { percent, rupees } from "./explain";
import { percentOf } from "./money";
import type { BasisPoints, Paise } from "./money";
import type { Explained } from "./types";

/** ₹1 tolerance per invoice (docs/BILLING_RULES.md, section 10). */
const TDS_TOLERANCE_PAISE = 100;

/**
 * Expected TDS on an invoice: the tenant's rate on the taxable value only,
 * GST excluded (section 10) [CA]. Rate is a tenant setting, never a constant.
 */
export function expectedTds({
  taxablePaise,
  tdsRateBp,
  deductsTds,
}: {
  taxablePaise: Paise;
  tdsRateBp: BasisPoints;
  deductsTds: boolean;
}): Explained {
  if (!Number.isSafeInteger(tdsRateBp) || tdsRateBp < 0) {
    throw new RangeError(
      `TDS rate must be whole basis points ≥ 0, got ${tdsRateBp}`,
    );
  }
  if (!deductsTds) {
    return {
      amount: 0,
      explanation: {
        rule: "No TDS",
        steps: ["This tenant doesn't deduct TDS"],
        result: 0,
      },
    };
  }
  const amount = percentOf(taxablePaise, tdsRateBp);
  return {
    amount,
    explanation: {
      rule: "TDS on taxable value",
      steps: [
        `TDS ${percent(tdsRateBp)} of taxable value ${rupees(taxablePaise)} (GST excluded) = ${rupees(amount)}`,
      ],
      result: amount,
    },
  };
}

/**
 * How one payment settles one invoice: received + TDS deducted = settled.
 * A payment short by the expected TDS (within ₹1) is "paid with TDS", not
 * "part-paid". Anything received above the total is excess credit.
 */
export function settlePayment({
  invoiceTotalPaise,
  receivedPaise,
  expectedTdsPaise,
}: {
  invoiceTotalPaise: Paise;
  receivedPaise: Paise;
  expectedTdsPaise: Paise;
}): {
  status: "paid" | "paid_with_tds" | "part_paid";
  tdsDeductedPaise: Paise;
  settledPaise: Paise;
  excessPaise: Paise;
} {
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
    Math.abs(shortfall - expectedTdsPaise) <= TDS_TOLERANCE_PAISE
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

/** TDS records are kept per tenant per FY quarter of the payment date. */
export function tdsQuarter(paymentDate: PlainDate): {
  financialYear: string;
  quarter: 1 | 2 | 3 | 4;
} {
  return {
    financialYear: financialYear(paymentDate).label,
    quarter: fyQuarter(paymentDate).quarter,
  };
}
