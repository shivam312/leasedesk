// Credit notes (docs/BILLING_RULES.md section 12): what a credit note takes
// off one sent invoice, line by line, with tax in the same split as the
// original. Pure.

import { financialYear, type PlainDate } from "./dates";
import { rupees } from "./explain";
import { lineTax, type SupplyType } from "./gst";
import { sumPaise } from "./money";
import type { Paise } from "./money";
import type { Explanation } from "./types";

type Taxes = { cgst: Paise; sgst: Paise; igst: Paise };

/** One line of the original invoice, with what earlier credit notes took off it. */
export type CreditableLine = Taxes & {
  id: string;
  description: string;
  taxablePaise: Paise;
  gstRateBp: number;
  credited: Taxes & { taxable: Paise };
};

export type CreditNoteLine = Taxes & {
  invoiceLineId: string;
  description: string;
  taxablePaise: Paise;
  gstRateBp: number;
  explanation: Explanation;
};

export type CreditNoteAmounts = {
  lines: CreditNoteLine[];
  totals: Taxes & { taxable: Paise; roundOff: Paise; total: Paise };
  /** Nothing is left on the invoice after this credit note. */
  fullyCredited: boolean;
};

/**
 * The credit note for `request` (the amount before GST to take off each
 * line). Crediting all that is left on a line reverses exactly the tax left
 * on it, so a whole invoice reverses to the paisa. A part credit works GST
 * out on the amount credited at the line's rate (section 8), never more than
 * the tax left. The invoice's round off is reversed only with the last of
 * the invoice, and only if that leaves the note above zero; a part credit
 * has none. [CA]
 */
export function creditNoteAmounts({
  supply,
  roundOff,
  creditedRoundOff,
  lines,
  request,
}: {
  supply: SupplyType;
  /** The invoice's round off. */
  roundOff: Paise;
  /** Round off already reversed by earlier credit notes. */
  creditedRoundOff: Paise;
  lines: readonly CreditableLine[];
  request: readonly { lineId: string; taxablePaise: Paise }[];
}): CreditNoteAmounts {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out: CreditNoteLine[] = [];
  const creditedNow = new Map<string, Paise>();
  for (const { lineId, taxablePaise } of request) {
    if (!Number.isSafeInteger(taxablePaise) || taxablePaise < 0)
      throw new RangeError(
        `Credit amount must be whole paise ≥ 0, got ${taxablePaise}`,
      );
    if (taxablePaise === 0) continue;
    const line = byId.get(lineId);
    if (!line) throw new Error("That line isn't on this invoice");
    if (creditedNow.has(lineId))
      throw new Error("A line can be credited once per credit note");
    const left = {
      taxable: line.taxablePaise - line.credited.taxable,
      cgst: line.cgst - line.credited.cgst,
      sgst: line.sgst - line.credited.sgst,
      igst: line.igst - line.credited.igst,
    };
    if (taxablePaise > left.taxable)
      throw new RangeError(
        `${line.description}: at most ${rupees(left.taxable)} before GST is left to credit`,
      );
    creditedNow.set(lineId, taxablePaise);
    let taxes: Taxes;
    let explanation: Explanation;
    if (taxablePaise === left.taxable) {
      taxes = { cgst: left.cgst, sgst: left.sgst, igst: left.igst };
      explanation = {
        rule: "All that is left of this line, with the GST charged on it",
        steps: [
          `${rupees(taxablePaise)} before GST`,
          ...(supply === "inter_state"
            ? [`IGST ${rupees(taxes.igst)}, as charged`]
            : [
                `CGST ${rupees(taxes.cgst)}, as charged`,
                `SGST ${rupees(taxes.sgst)}, as charged`,
              ]),
        ],
        result: taxablePaise + taxes.cgst + taxes.sgst + taxes.igst,
      };
    } else {
      const tax = lineTax(taxablePaise, line.gstRateBp, supply);
      taxes = {
        cgst: Math.min(tax.cgst, left.cgst),
        sgst: Math.min(tax.sgst, left.sgst),
        igst: Math.min(tax.igst, left.igst),
      };
      explanation = {
        rule: "Part of this line, with GST at the line's rate",
        steps: [`${rupees(taxablePaise)} before GST`, ...tax.explanation.steps],
        result: taxablePaise + taxes.cgst + taxes.sgst + taxes.igst,
      };
    }
    out.push({
      invoiceLineId: line.id,
      description: line.description,
      taxablePaise,
      gstRateBp: line.gstRateBp,
      ...taxes,
      explanation,
    });
  }
  if (out.length === 0)
    throw new Error("Enter an amount to credit on at least one line");

  const fullyCredited = lines.every(
    (l) => l.taxablePaise - l.credited.taxable === (creditedNow.get(l.id) ?? 0),
  );
  const taxable = sumPaise(out.map((l) => l.taxablePaise));
  const cgst = sumPaise(out.map((l) => l.cgst));
  const sgst = sumPaise(out.map((l) => l.sgst));
  const igst = sumPaise(out.map((l) => l.igst));
  // The rest of the invoice's round off goes on its last credit note, unless
  // it would bring that note to zero or below (a negative round off larger
  // than the last few paise left); then the note has none, and the invoice
  // stays over-credited by less than ₹0.50, within its round off. [CA]
  const rest = roundOff - creditedRoundOff;
  const lastRoundOff =
    fullyCredited && taxable + cgst + sgst + igst + rest > 0 ? rest : 0;
  return {
    lines: out,
    totals: {
      taxable,
      cgst,
      sgst,
      igst,
      roundOff: lastRoundOff,
      total: taxable + cgst + sgst + igst + lastRoundOff,
    },
    fullyCredited,
  };
}

/**
 * The last day a credit note can reduce the GST on an invoice: 30 November
 * after the end of the invoice's financial year (CGST Act section 34(2)). [CA]
 */
export function creditNoteDeadline(invoiceDate: PlainDate): PlainDate {
  return `${financialYear(invoiceDate).startYear + 1}-11-30`;
}
