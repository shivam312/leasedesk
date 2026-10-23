// UPI payment links (the text inside an invoice's UPI QR code), in the
// NPCI deep-link format: upi://pay?pa=<UPI ID>&pn=<payee>&am=<rupees>&cu=INR&tn=<note>.

/** Paise → "106917.75", by integer arithmetic. */
function rupeesWithPaise(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0)
    throw new RangeError(`Expected whole paise ≥ 0, got ${paise}`);
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

export function upiPaymentLink({
  upiId,
  payeeName,
  amountPaise,
  note,
}: {
  upiId: string;
  payeeName: string;
  /** Left out of the link when 0, so the payer types it. */
  amountPaise: number;
  /** Shown in the payer's app and bank statement: the invoice number. */
  note: string;
}): string {
  const params: [string, string][] = [
    ["pa", upiId],
    ["pn", payeeName],
    ...(amountPaise > 0
      ? ([["am", rupeesWithPaise(amountPaise)]] as [string, string][])
      : []),
    ["cu", "INR"],
    ["tn", note],
  ];
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
