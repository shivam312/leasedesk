import { describe, expect, it } from "vitest";
import { billingSettings } from "../billing";
import { resolveSettings } from "../resolve";

describe("billingSettings", () => {
  it("gives the engine the documented defaults when nothing is stored", () => {
    // docs/BILLING_RULES.md section 2 and 7: rupee, rupee, 7 days.
    expect(billingSettings(resolveSettings({}))).toEqual({
      roundIncreasedRent: "rupee",
      roundInvoiceTotal: "rupee",
      partPeriodMethod: "month_by_month",
      monthEndRule: "roll_forward",
      dueDays: 7,
    });
  });

  it("passes on values resolved from each level", () => {
    expect(
      billingSettings(
        resolveSettings({
          organization: { "billing.roundInvoiceTotal": "none" },
          building: { "invoice.dueDays": 10 },
          lease: { "billing.roundIncreasedRent": "none" },
        }),
      ),
    ).toEqual({
      roundIncreasedRent: "none",
      roundInvoiceTotal: "none",
      partPeriodMethod: "month_by_month",
      monthEndRule: "roll_forward",
      dueDays: 10,
    });
  });
});
