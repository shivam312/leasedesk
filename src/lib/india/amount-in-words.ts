// Amount in words for invoices, in the Indian system (thousand, lakh, crore):
// "Rupees One Lakh Eighteen Thousand Only". Whole paise in, no floats.

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

/** 1–99 */
function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  const ten = TENS[Math.floor(n / 10)]!;
  return n % 10 === 0 ? ten : `${ten} ${ONES[n % 10]}`;
}

/** A positive whole number in words; crores can themselves be any size. */
function words(n: bigint): string {
  const parts: string[] = [];
  const crore = n / 10_000_000n;
  if (crore > 0n) parts.push(`${words(crore)} Crore`);
  let rest = Number(n % 10_000_000n);
  const groups: [number, string][] = [
    [100_000, "Lakh"],
    [1_000, "Thousand"],
    [100, "Hundred"],
  ];
  for (const [size, name] of groups) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${belowHundred(count)} ${name}`);
    rest %= size;
  }
  if (rest > 0) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** `amountInWords(11800000)` → "Rupees One Lakh Eighteen Thousand Only". */
export function amountInWords(paise: number | bigint): string {
  if (typeof paise === "number" && !Number.isSafeInteger(paise))
    throw new RangeError(`amountInWords expects whole paise, got ${paise}`);
  const value = BigInt(paise);
  if (value < 0n)
    throw new RangeError(
      `amountInWords expects a positive amount, got ${paise}`,
    );
  const rupees = value / 100n;
  const rest = Number(value % 100n);
  const rupeeWords = rupees === 0n ? "Zero" : words(rupees);
  const paiseWords = rest === 0 ? "" : ` and ${belowHundred(rest)} Paise`;
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
