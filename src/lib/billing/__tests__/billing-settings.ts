// The default BillingSettings, for tests only. The engine has no defaults of
// its own: callers pass the resolved settings (src/lib/settings/billing.ts).

import type { BillingSettings } from "../types";

export const DEFAULT_SETTINGS: BillingSettings = {
  roundIncreasedRent: "rupee",
  roundInvoiceTotal: "rupee",
  partPeriodMethod: "month_by_month",
  monthEndRule: "roll_forward",
  midMonthIncreaseLines: "two_lines",
  afterCustomIncrease: "stop_rule",
  skipZeroInvoices: true,
  gstRounding: "per_line",
  dueDays: 7,
};

export const withSettings = (
  overrides: Partial<BillingSettings>,
): BillingSettings => ({ ...DEFAULT_SETTINGS, ...overrides });
