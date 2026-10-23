// Names of tax forms and sections as shown on screen, in one place
// (india-compliance skill): the Income-tax Act 2025 renumbers sections and
// forms, so nothing else in the code spells them out. [CA] (D-021)

export const TAX_LABELS = {
  /** The certificate a tenant issues for TDS deducted on rent. */
  tdsCertificate: "Form 16A",
  /** The section rent TDS is deducted under. */
  rentTdsSection: "section 194-I",
  /** The tax statement where a landlord sees TDS deducted for them. */
  taxCreditStatement: "Form 26AS",
} as const;

/**
 * When the tenant must issue the TDS certificate for each financial-year
 * quarter: 15 days after the quarterly TDS return is due. Month and day;
 * Q3 and Q4 fall in the calendar year after the financial year starts.
 * [CA] (D-021)
 */
export const TDS_CERTIFICATE_DUE: Record<
  1 | 2 | 3 | 4,
  { month: number; day: number }
> = {
  1: { month: 8, day: 15 }, // Apr–Jun → 15 Aug
  2: { month: 11, day: 15 }, // Jul–Sep → 15 Nov
  3: { month: 2, day: 15 }, // Oct–Dec → 15 Feb
  4: { month: 6, day: 15 }, // Jan–Mar → 15 Jun
};
