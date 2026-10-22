import { formatINR } from "@/lib/format";

/** ₹ amount for explanation sentences. */
export const rupees = formatINR;

/** 125050 hundredths → "1,250.50" (Indian grouping, decimals only when needed). */
export function hundredths(value: number): string {
  // formatINR already does Indian grouping of a hundredths value; drop the ₹.
  return formatINR(value).replace("₹", "");
}

/** 500 bp → "5%", 1250 bp → "12.5%". */
export function percent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = Math.abs(bp % 100);
  if (rest === 0) return `${whole}%`;
  return `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}%`;
}
