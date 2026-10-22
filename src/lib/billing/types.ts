import type { BasisPoints, Paise } from "./money";
import type { PlainDate } from "./dates";

/** How an amount was calculated, shown when the user taps it. */
export type Explanation = {
  /** The rule applied, in plain words, e.g. "Rent per sq ft". */
  rule: string;
  /** One sentence per step, e.g. "1,250.50 sq ft × ₹85.50 = ₹1,06,917.75". */
  steps: string[];
  result: Paise;
};

export type Explained = { amount: Paise; explanation: Explanation };

export type ChargeType =
  "rent" | "cam" | "parking" | "utilities" | "signage" | "other";

export type ChargeAmount =
  /** A fixed amount per billing period (month, or quarter if quarterly). */
  | { basis: "fixed"; amountPaise: Paise }
  /** Rate in paise per sq ft per month × area in hundredths of a sq ft. */
  | { basis: "per_sqft"; ratePaise: Paise; areaHundredths: number }
  /** Rate in paise per slot per month × number of slots. */
  | { basis: "per_slot"; ratePaise: Paise; slots: number };

/** A lease charge (docs/BILLING_RULES.md, section 3; lease_charges table). */
export type Charge = ChargeAmount & {
  id: string;
  type: ChargeType;
  label?: string;
  startDate: PlainDate;
  endDate?: PlainDate;
  /** Default `monthly`. */
  frequency?: "monthly" | "quarterly";
  /** Default `advance`. */
  timing?: "advance" | "arrears";
  /** From the lease charge or the building default; never assumed here. */
  gstRateBp: BasisPoints;
  /** From the lease charge or the building default; never assumed here. */
  sacCode: string;
  /** Default `true` for rent, `false` for everything else. */
  waivedDuringRentFree?: boolean;
};

/** The lease dates the engine needs (leases table). */
export type LeaseTerms = {
  id: string;
  startDate: PlainDate;
  /** Last day of the lease, inclusive. */
  endDate: PlainDate;
  /** Set months or days, not both. */
  rentFreeMonths?: number;
  rentFreeDays?: number;
};
