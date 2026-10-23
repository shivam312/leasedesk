// The billing engine's settings, taken from the resolved settings. Server code
// resolves settings for a lease (store.ts or resolve.ts) and passes the
// result of billingSettings() to the engine, which never loads them itself.

import type { BillingSettings } from "@/lib/billing/types";
import type { Settings } from "./schema";

export function billingSettings(settings: Settings): BillingSettings {
  return {
    roundIncreasedRent: settings["billing.roundIncreasedRent"],
    roundInvoiceTotal: settings["billing.roundInvoiceTotal"],
    partPeriodMethod: settings["billing.partPeriodMethod"],
    monthEndRule: settings["billing.monthEndRule"],
    midMonthIncreaseLines: settings["billing.midMonthIncreaseLines"],
    afterCustomIncrease: settings["billing.afterCustomIncrease"],
    skipZeroInvoices: settings["billing.skipZeroInvoices"],
    gstRounding: settings["gst.rounding"],
    tdsRounding: settings["tds.rounding"],
    tdsTolerancePaise: settings["tds.tolerancePaise"],
    tdsQuarterBasis: settings["tds.quarterBasis"],
    dueDays: settings["invoice.dueDays"],
  };
}
