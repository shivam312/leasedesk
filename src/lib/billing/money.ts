/**
 * Money helpers for the billing engine (docs/BILLING_RULES.md, sections 1–2).
 *
 * Amounts are integer paise, percentages are basis points, quantities such as
 * area are integer hundredths. Every multiply/divide goes through `mulDiv`,
 * which computes in bigint and rounds half up to the paisa exactly once.
 */

export type Paise = number;
export type BasisPoints = number;

const BP_DENOMINATOR = 10_000;

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

function toSafeNumber(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError(`Amount ${value} is beyond the safe integer range`);
  }
  return Number(value);
}

/**
 * round(a × b ÷ c), rounding half up to the nearest integer.
 * Negative results round symmetrically (half away from zero), so a credit
 * note mirrors its invoice exactly.
 */
export function mulDiv(a: number, b: number, c: number): number {
  assertSafeInteger(a, "mulDiv a");
  assertSafeInteger(b, "mulDiv b");
  assertSafeInteger(c, "mulDiv divisor");
  if (c <= 0) throw new RangeError(`mulDiv divisor must be positive, got ${c}`);

  return roundDiv(BigInt(a) * BigInt(b), BigInt(c));
}

/** round(n ÷ divisor), half away from zero, as a safe number. */
function roundDiv(n: bigint, divisor: bigint): number {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  // floor(abs / c + 1/2) = floor((2·abs + c) / 2c)
  const rounded = (2n * abs + divisor) / (2n * divisor);
  return toSafeNumber(negative ? -rounded : rounded);
}

/** `bp` basis points of `amount`, rounded to the paisa. 18% of ₹100 = ₹18. */
export function percentOf(amount: Paise, bp: BasisPoints): Paise {
  return mulDiv(amount, bp, BP_DENOMINATOR);
}

/** `amount` × (10000 + bp) / 10000, rounded to the paisa. */
export function increaseByPercent(amount: Paise, bp: BasisPoints): Paise {
  return mulDiv(amount, BP_DENOMINATOR + bp, BP_DENOMINATOR);
}

/**
 * Σ (amount × bp ÷ 10000) over several parts, rounded once straight to the
 * nearest rupee. Rent ₹49,994.95 at 10% + CAM ₹0.05 at 10% = ₹4,999.50 → ₹5,000.
 */
export function sumOfPercentsToRupee(
  parts: readonly { amount: Paise; bp: BasisPoints }[],
): Paise {
  let total = 0n;
  for (const { amount, bp } of parts) {
    assertSafeInteger(amount, "amount");
    assertSafeInteger(bp, "basis points");
    total += BigInt(amount) * BigInt(bp);
  }
  return roundDiv(total, BigInt(BP_DENOMINATOR * 100)) * 100;
}

/**
 * `amount` × (10000 + bp) / 10000, rounded once straight to the nearest
 * rupee. ₹90,015.71 + 5% = ₹94,516.4955 → ₹94,516 (not ₹94,516.50 → ₹94,517).
 */
export function increaseByPercentToRupee(
  amount: Paise,
  bp: BasisPoints,
): Paise {
  return mulDiv(amount, BP_DENOMINATOR + bp, BP_DENOMINATOR * 100) * 100;
}

/** Nearest whole rupee, half up. ₹1,15,762.50 → ₹1,15,763. */
export function roundToRupee(amount: Paise): Paise {
  return mulDiv(amount, 1, 100) * 100;
}

/** Invoice total rounded to the rupee, with the separate "Round off" line. */
export function roundOffToRupee(total: Paise): {
  rounded: Paise;
  roundOff: Paise;
} {
  const rounded = roundToRupee(total);
  return { rounded, roundOff: rounded - total };
}

/** amount × days ÷ totalDays, rounded to the paisa (section 6). */
export function prorate(amount: Paise, days: number, totalDays: number): Paise {
  assertSafeInteger(days, "days");
  if (days < 0 || days > totalDays) {
    throw new RangeError(`Billable days ${days} must be 0–${totalDays}`);
  }
  return mulDiv(amount, days, totalDays);
}

/**
 * rate × quantity, where quantity is in hundredths (area in hundredths of a
 * sq ft). ₹85.50/sq ft × 1,250.50 sq ft = 8550 × 125050 ÷ 100 = ₹1,06,917.75.
 */
export function perUnitMonthly(
  ratePaise: Paise,
  quantityHundredths: number,
): Paise {
  return mulDiv(ratePaise, quantityHundredths, 100);
}

export function sumPaise(amounts: readonly Paise[]): Paise {
  let total = 0n;
  for (const amount of amounts) {
    assertSafeInteger(amount, "amount");
    total += BigInt(amount);
  }
  return toSafeNumber(total);
}
