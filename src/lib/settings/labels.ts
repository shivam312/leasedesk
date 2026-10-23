// How each setting on Settings → Billing rules is shown: a plain label, what
// it changes, how its value is entered, and words for each option
// (docs/AUTONOMY.md, "How to add a setting", step 6). Only settings whose
// behaviour is built are listed; alerts and invoice numbering arrive with
// their features.

import type { Scope, SettingKey } from "./schema";

export type Input =
  | { kind: "choice"; options: Record<string, string> }
  | { kind: "boolean"; yes: string; no: string }
  | { kind: "percent" }
  | { kind: "rupees" }
  | { kind: "days" }
  /** Several day counts, typed "1, 7, 15"; blank means none. */
  | { kind: "dayList" }
  | { kind: "dayOfMonth" }
  | { kind: "text"; placeholder?: string };

export interface SettingLabel {
  label: string;
  help: string;
  input: Input;
}

export const SETTING_LABELS: Partial<Record<SettingKey, SettingLabel>> = {
  "billing.roundIncreasedRent": {
    label: "Round rent after an increase",
    help: "₹1,10,250 + 5% = ₹1,15,762.50. To the rupee, that becomes ₹1,15,763.",
    input: {
      kind: "choice",
      options: { rupee: "To the nearest rupee", none: "Keep the paise" },
    },
  },
  "billing.roundInvoiceTotal": {
    label: "Round invoice totals",
    help: "₹1,26,162.95 becomes ₹1,26,163 with a ₹0.05 round-off line.",
    input: {
      kind: "choice",
      options: { rupee: "To the nearest rupee", none: "Keep the paise" },
    },
  },
  "billing.partPeriodMethod": {
    label: "Part quarter",
    help: "₹30,000 a quarter from 15 May: month by month ₹15,483.87; by days in the quarter ₹15,494.51.",
    input: {
      kind: "choice",
      options: {
        month_by_month: "Month by month",
        days_in_period: "By days in the quarter",
      },
    },
  },
  "billing.monthEndRule": {
    label: "A month after the 31st",
    help: "Lease from 31 Jan with 1 month rent-free: rent starts 1 Mar, or 28 Feb.",
    input: {
      kind: "choice",
      options: {
        roll_forward: "1st of the next month (1 Mar)",
        last_day: "Last day of the month (28 Feb)",
      },
    },
  },
  "billing.midMonthIncreaseLines": {
    label: "Month with a rent increase",
    help: "Rent goes up on 16 April: one invoice line for April, or one line for each rate.",
    input: {
      kind: "choice",
      options: { two_lines: "Two lines, one per rate", one_line: "One line" },
    },
  },
  "billing.afterCustomIncrease": {
    label: "After a custom rent increase",
    help: "Rent goes up 5% every April and you set a custom rent from Oct 2028: the 5% increases stop, or carry on from the custom rent.",
    input: {
      kind: "choice",
      options: {
        stop_rule: "Stop the automatic increases",
        resume_rule: "Carry on from the custom rent",
      },
    },
  },
  "billing.skipZeroInvoices": {
    label: "₹0 invoices",
    help: "When a lease has nothing to bill in a month.",
    input: { kind: "boolean", yes: "Don't create them", no: "Create them" },
  },
  "billing.defaultTiming": {
    label: "New charges are billed",
    help: "In advance: April is billed on 1 April. In arrears: April is billed on 1 May. Applies to charges added from now on.",
    input: {
      kind: "choice",
      options: { advance: "In advance", arrears: "In arrears" },
    },
  },
  "gst.defaultRateBp": {
    label: "GST rate for new charges",
    help: "Most commercial rent is 18%. Applies to charges added from now on.",
    input: { kind: "percent" },
  },
  "gst.defaultSac": {
    label: "SAC code for new charges",
    help: "997212 is renting of non-residential property.",
    input: { kind: "text", placeholder: "997212" },
  },
  "gst.rounding": {
    label: "Round GST",
    help: "On each invoice line, or once on the invoice total. Ask your CA if unsure.",
    input: {
      kind: "choice",
      options: { per_line: "On each line", per_invoice: "Once per invoice" },
    },
  },
  "invoice.dueDays": {
    label: "Payment due",
    help: "Days after the invoice date. 7 days: an invoice of 1 May is due 8 May.",
    input: { kind: "days" },
  },
  "invoice.runDay": {
    label: "Day to make invoices",
    help: "On the 1st: that month's invoices. On a later day, the next month's: the 25th makes November's invoices on 25 Oct. Nothing is sent until you send it.",
    input: { kind: "dayOfMonth" },
  },
  "reminders.autoSend": {
    label: "Payment reminders",
    help: "Emails tenants about unpaid invoices on the days below. Turn off to remind tenants yourself.",
    input: {
      kind: "boolean",
      yes: "Send automatically",
      no: "Don't send reminders",
    },
  },
  "reminders.beforeDueDays": {
    label: "Remind before the due date",
    help: "Days before the due date. 3 means an invoice due 8 May gets a reminder on 5 May. Leave blank for none.",
    input: { kind: "dayList" },
  },
  "reminders.afterDueDays": {
    label: "Remind after the due date",
    help: "Days after the due date, separated by commas, until it's paid. 1, 7, 15 means an invoice due 8 May gets reminders on 9, 15 and 23 May. Leave blank for none.",
    input: { kind: "dayList" },
  },
  "tds.rounding": {
    label: "Expected TDS",
    help: "10% of ₹1,06,917.75 is ₹10,691.775: ₹10,692 to the rupee, ₹10,691.78 to the paisa.",
    input: {
      kind: "choice",
      options: { rupee: "To the nearest rupee", paisa: "To the paisa" },
    },
  },
  "tds.tolerancePaise": {
    label: "Paid with TDS, within",
    help: "A payment short by the expected TDS give or take this much counts as paid.",
    input: { kind: "rupees" },
  },
  "tds.quarterBasis": {
    label: "Track TDS in the quarter of",
    help: "Paid on 5 April for a March invoice: April–June, or January–March.",
    input: {
      kind: "choice",
      options: {
        payment_date: "The payment date",
        invoice_date: "The invoice date",
      },
    },
  },
};

/** The settings shown at a level, in the order above. */
export function shownKeys(
  scope: Scope,
  keysForScope: (scope: Scope) => SettingKey[],
): SettingKey[] {
  const inScope = new Set(keysForScope(scope));
  return (Object.keys(SETTING_LABELS) as SettingKey[]).filter((k) =>
    inScope.has(k),
  );
}
