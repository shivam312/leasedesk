// Indian business identifiers: GSTIN, PAN, IFSC, UPI ID, and GST state codes.
// Pure functions; used by forms (server-side validation) and the seed.

/** GST state and union territory codes. */
export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The 15th character of a GSTIN, from the first 14 (the GSTN check-digit rule). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(first14[i] ?? "");
    if (value < 0)
      throw new Error(`"${first14}" has a character a GSTIN can't`);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36]!;
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const GSTIN_RE = /^(\d{2})([A-Z]{5}\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])$/;

/** Upper-case and without spaces, as people often type them. */
export function normalizeId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidPan(pan: string): boolean {
  return PAN_RE.test(pan);
}

/** Why a GSTIN is wrong, in plain words, or null when it's valid. */
export function gstinProblem(gstin: string): string | null {
  if (gstin.length !== 15) return "A GSTIN has 15 characters.";
  const match = GSTIN_RE.exec(gstin);
  if (!match)
    return "That doesn't look like a GSTIN. Check it against your GST certificate.";
  if (!GST_STATES[match[1]!]) return `${match[1]} isn't a GST state code.`;
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14])
    return "This GSTIN has a typing mistake (its last character doesn't match). Check it against your GST certificate.";
  return null;
}

export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
}

export function isValidUpiId(upi: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(upi);
}

/** A valid GSTIN for a state and PAN (entity number 1), for seed data and tests. */
export function makeGstin(
  stateCode: string,
  pan: string,
  entity = "1",
): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckDigit(first14);
}
