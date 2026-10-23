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
    dueDays: settings["invoice.dueDays"],
  };
}
