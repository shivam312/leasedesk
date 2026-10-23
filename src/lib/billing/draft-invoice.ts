import { compareDates } from "./dates";
import type { PlainDate, YearMonth } from "./dates";
import { hundredths } from "./explain";
import { invoiceTax, invoiceTotals } from "./gst";
import type { SupplyType } from "./gst";
import { invoiceForRun } from "./invoice-lines";
import type { InvoiceLine } from "./invoice-lines";
import type { Paise } from "./money";
import type { LeaseInput } from "./schedule";
import { expectedTds } from "./tds";
import type { TenantTds } from "./tds";
import type { BillingSettings, Charge, Explained, Explanation } from "./types";

export type DraftLine = InvoiceLine & {
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  /** "1,250.50 sq ft" or "2 slots"; null for a fixed amount. */
  quantityLabel: string | null;
  taxExplanation: Explanation;
};

export type DraftInvoice = {
  invoiceDate: PlainDate;
  dueDate: PlainDate;
  /** From the earliest line's first day to the latest line's last day. */
  periodStart: PlainDate;
  periodEnd: PlainDate;
  lines: DraftLine[];
  totals: ReturnType<typeof invoiceTotals>;
  expectedTds: Explained;
};

/**
 * A whole draft invoice for one lease in one monthly run: its lines
 * (section 7), GST on each line (section 8, `gst.rounding`), the totals and
 * round-off (section 2) and the expected TDS (section 10). `null` when there
 * is nothing to bill. The supply type comes from the billing GSTIN and the
 * building's state (`supplyType` in gst.ts); the TDS settings from the tenant.
 */
export function draftInvoice({
  lease,
  runMonth,
  settings,
  supply,
  tds,
}: {
  lease: LeaseInput;
  runMonth: YearMonth;
  settings: BillingSettings;
  supply: SupplyType;
  tds: TenantTds;
}): DraftInvoice | null {
  const invoice = invoiceForRun(lease, runMonth, settings);
  if (!invoice) return null;
  const taxes = invoiceTax(
    invoice.lines.map((l) => ({
      taxablePaise: l.taxablePaise,
      gstRateBp: l.gstRateBp,
      key: `${l.chargeId}:${l.periodStart}`,
    })),
    supply,
    settings,
  );
  const charges = new Map(lease.charges.map((c) => [c.id, c]));
  const lines = invoice.lines.map((line, i): DraftLine => {
    const tax = taxes[i]!;
    return {
      ...line,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      quantityLabel: quantityLabel(charges.get(line.chargeId)),
      taxExplanation: tax.explanation,
    };
  });
  const starts = lines.map((l) => l.periodStart).sort(compareDates);
  const ends = lines.map((l) => l.periodEnd).sort(compareDates);
  return {
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    periodStart: starts[0]!,
    periodEnd: ends[ends.length - 1]!,
    lines,
    totals: invoiceTotals(lines, settings),
    expectedTds: expectedTds({ lines, tds, settings }),
  };
}

function quantityLabel(charge: Charge | undefined): string | null {
  if (!charge) return null;
  switch (charge.basis) {
    case "per_sqft":
      return `${hundredths(charge.areaHundredths)} sq ft`;
    case "per_slot":
      return `${charge.slots} ${charge.slots === 1 ? "slot" : "slots"}`;
    case "fixed":
      return null;
  }
}
