import { percent, rupees } from "./explain";
import { mulDiv, percentOf, roundOffToRupee, sumPaise } from "./money";
import type { BasisPoints, Paise } from "./money";
import type { BillingSettings, Explanation } from "./types";

/**
 * GST on rent (docs/BILLING_RULES.md, section 8) [CA].
 * Place of supply is where the property is: CGST + SGST when the billing
 * GSTIN's state is the building's state, otherwise IGST. The tenant's GSTIN
 * never changes the split.
 */
export type SupplyType = "intra_state" | "inter_state";

const GSTIN_RE = /^\d{2}[0-9A-Z]{13}$/;

/** State code = first two digits of a GSTIN. */
export function gstinStateCode(gstin: string): string {
  if (!GSTIN_RE.test(gstin)) {
    throw new Error(`"${gstin}" is not a valid GSTIN`);
  }
  return gstin.slice(0, 2);
}

export function supplyType({
  billingGstin,
  buildingStateCode,
}: {
  billingGstin: string;
  buildingStateCode: string;
}): SupplyType {
  if (!/^\d{2}$/.test(buildingStateCode)) {
    throw new Error(`"${buildingStateCode}" is not a two-digit state code`);
  }
  return gstinStateCode(billingGstin) === buildingStateCode
    ? "intra_state"
    : "inter_state";
}

/** Tax on one invoice line, each tax rounded to the paisa separately. */
export function lineTax(
  taxable: Paise,
  rateBp: BasisPoints,
  supply: SupplyType,
): { cgst: Paise; sgst: Paise; igst: Paise; explanation: Explanation } {
  if (!Number.isSafeInteger(rateBp) || rateBp < 0) {
    throw new RangeError(
      `GST rate must be whole basis points ≥ 0, got ${rateBp}`,
    );
  }
  if (supply === "inter_state") {
    const igst = percentOf(taxable, rateBp);
    return {
      cgst: 0,
      sgst: 0,
      igst,
      explanation: {
        rule: "IGST: billing GSTIN is in a different state from the building",
        steps: [
          `IGST ${percent(rateBp)} of ${rupees(taxable)} = ${rupees(igst)}`,
        ],
        result: igst,
      },
    };
  }
  // Half the rate each, computed exactly: taxable × rate ÷ 20000.
  const half = mulDiv(taxable, rateBp, 20_000);
  const halfRate =
    rateBp % 2 === 0 ? percent(rateBp / 2) : `${percent(rateBp)} ÷ 2`;
  return {
    cgst: half,
    sgst: half,
    igst: 0,
    explanation: {
      rule: "CGST + SGST: billing GSTIN is in the building's state",
      steps: [
        `CGST ${halfRate} of ${rupees(taxable)} = ${rupees(half)}`,
        `SGST ${halfRate} of ${rupees(taxable)} = ${rupees(half)}`,
      ],
      result: half * 2,
    },
  };
}

/** Invoice totals with the optional "Round off" line (section 2) [CA]. */
export function invoiceTotals(
  lines: readonly {
    taxablePaise: Paise;
    cgst: Paise;
    sgst: Paise;
    igst: Paise;
  }[],
  settings: Pick<BillingSettings, "roundInvoiceTotal">,
): {
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  subtotal: Paise;
  roundOff: Paise;
  grandTotal: Paise;
} {
  const taxable = sumPaise(lines.map((l) => l.taxablePaise));
  const cgst = sumPaise(lines.map((l) => l.cgst));
  const sgst = sumPaise(lines.map((l) => l.sgst));
  const igst = sumPaise(lines.map((l) => l.igst));
  const subtotal = sumPaise([taxable, cgst, sgst, igst]);
  const { rounded, roundOff } =
    settings.roundInvoiceTotal === "rupee"
      ? roundOffToRupee(subtotal)
      : { rounded: subtotal, roundOff: 0 };
  return { taxable, cgst, sgst, igst, subtotal, roundOff, grandTotal: rounded };
}

type LineTax = ReturnType<typeof lineTax>;

/**
 * Tax on every line of one invoice (section 8, setting `gst.rounding`) [CA].
 *
 * - `per_line` (default): each line's tax rounded on its own (`lineTax`).
 * - `per_invoice`: for each GST rate, each tax is worked out once on the
 *   taxable total of the lines at that rate. The lines still carry their own
 *   tax, so the printed lines add up: the difference between the total and
 *   the sum of the line-rounded taxes goes on the largest line at that rate
 *   (if several are equal, the one with the lowest `key`, else the first;
 *   give every line a key, or none).
 */
export function invoiceTax(
  lines: readonly {
    taxablePaise: Paise;
    gstRateBp: BasisPoints;
    /** Stable line identity (charge and period) that breaks a tie on size. */
    key?: string;
  }[],
  supply: SupplyType,
  settings: Pick<BillingSettings, "gstRounding">,
): LineTax[] {
  const taxes = lines.map((l) => lineTax(l.taxablePaise, l.gstRateBp, supply));
  if (settings.gstRounding === "per_line") return taxes;

  const rates = [...new Set(lines.map((l) => l.gstRateBp))];
  for (const rate of rates) {
    const indexes = lines.flatMap((l, i) => (l.gstRateBp === rate ? [i] : []));
    const taxable = sumPaise(indexes.map((i) => lines[i]!.taxablePaise));
    const total = lineTax(taxable, rate, supply);
    // By size, so a credit note (negative lines) carries the difference on
    // the same line as its invoice did (section 12); equal sizes go to the
    // lower key, so the order the lines are listed in doesn't matter.
    const largest = indexes.reduce((best, i) => {
      const [a, b] = [lines[i]!, lines[best]!];
      const [sizeA, sizeB] = [
        Math.abs(a.taxablePaise),
        Math.abs(b.taxablePaise),
      ];
      if (sizeA !== sizeB) return sizeA > sizeB ? i : best;
      // Then a line with a key before one without, then the lower key, then
      // the earlier line: one fixed order, whichever line `reduce` meets first.
      if ((a.key === undefined) !== (b.key === undefined))
        return a.key !== undefined ? i : best;
      return a.key !== undefined && a.key < b.key! ? i : best;
    });
    const target = taxes[largest]!;
    const adjust = (key: "cgst" | "sgst" | "igst") =>
      total[key] - sumPaise(indexes.map((i) => taxes[i]![key]));
    const [cgst, sgst, igst] = [adjust("cgst"), adjust("sgst"), adjust("igst")];
    if (cgst === 0 && sgst === 0 && igst === 0) continue;
    taxes[largest] = {
      cgst: target.cgst + cgst,
      sgst: target.sgst + sgst,
      igst: target.igst + igst,
      explanation: {
        rule: "GST worked out once on the invoice total",
        steps: [
          ...target.explanation.steps,
          ...total.explanation.steps.map(
            (s) => `All lines at ${percent(rate)}: ${s}`,
          ),
          ...(
            [
              ["CGST", target.cgst, cgst],
              ["SGST", target.sgst, sgst],
              ["IGST", target.igst, igst],
            ] as const
          )
            .filter(([, , diff]) => diff !== 0)
            .map(
              ([name, own, diff]) =>
                `${name} on this line: ${rupees(own)} + rounding difference ${rupees(diff)} = ${rupees(own + diff)}, so the lines add up to the total`,
            ),
        ],
        result: target.cgst + cgst + target.sgst + sgst + target.igst + igst,
      },
    };
  }
  return taxes;
}
