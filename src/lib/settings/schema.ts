// Every setting, its options, default and where it may be set (docs/SETTINGS.md).
// Stored as flat keys in the `settings` jsonb column of organizations, billing
// entities, buildings, tenants and leases, e.g. { "invoice.dueDays": 10 }; only
// values that differ from the default are stored. Read them only through
// resolve.ts. A test checks this file against docs/SETTINGS.md.

import { z } from "zod";

export const SCOPES = [
  "organization",
  "billing_entity",
  "building",
  "tenant",
  "lease",
] as const;
export type Scope = (typeof SCOPES)[number];

export type Shown = "basic" | "advanced";

interface Definition<S extends z.ZodType> {
  schema: S;
  default: z.output<S>;
  scopes: readonly Scope[];
  shown: Shown;
}

const define = <S extends z.ZodType>(
  schema: S,
  defaultValue: z.output<S>,
  scopes: readonly Scope[],
  shown: Shown,
): Definition<S> => ({ schema, default: defaultValue, scopes, shown });

const days = z.array(z.int().min(0).max(366)).max(10);
/** A Tally ledger name, set for the organization. */
const ledger = (name: string) =>
  define(z.string().trim().min(1).max(100), name, ["organization"], "advanced");
const basisPoints = z.int().min(0).max(10000);

export const SETTINGS = {
  // Billing
  "billing.roundIncreasedRent": define(
    z.enum(["none", "rupee"]),
    "rupee",
    ["organization", "building", "lease"],
    "advanced",
  ),
  "billing.roundInvoiceTotal": define(
    z.enum(["none", "rupee"]),
    "rupee",
    ["organization"],
    "advanced",
  ),
  "billing.partPeriodMethod": define(
    z.enum(["month_by_month", "days_in_period"]),
    "month_by_month",
    ["organization", "lease"],
    "advanced",
  ),
  "billing.monthEndRule": define(
    z.enum(["roll_forward", "last_day"]),
    "roll_forward",
    ["organization", "lease"],
    "advanced",
  ),
  "billing.midMonthIncreaseLines": define(
    z.enum(["one_line", "two_lines"]),
    "two_lines",
    ["organization"],
    "advanced",
  ),
  "billing.afterCustomIncrease": define(
    z.enum(["stop_rule", "resume_rule"]),
    "stop_rule",
    ["lease"],
    "advanced",
  ),
  "billing.defaultTiming": define(
    z.enum(["advance", "arrears"]),
    "advance",
    ["building"],
    "advanced",
  ),
  "billing.skipZeroInvoices": define(
    z.boolean(),
    true,
    ["organization"],
    "advanced",
  ),

  // GST
  "gst.defaultRateBp": define(basisPoints, 1800, ["building"], "basic"),
  "gst.defaultSac": define(
    z.string().regex(/^\d{6}$/, "A SAC code is 6 digits"),
    "997212",
    ["building"],
    "basic",
  ),
  "gst.rounding": define(
    z.enum(["per_line", "per_invoice"]),
    "per_line",
    ["organization"],
    "advanced",
  ),

  // TDS (rates and on/off per charge type are tenant columns, D10)
  "tds.rounding": define(
    z.enum(["paisa", "rupee"]),
    "rupee",
    ["organization", "tenant"],
    "advanced",
  ),
  "tds.tolerancePaise": define(
    z.int().min(0).max(100000),
    100,
    ["organization"],
    "advanced",
  ),
  "tds.quarterBasis": define(
    z.enum(["payment_date", "invoice_date"]),
    "payment_date",
    ["organization"],
    "advanced",
  ),

  // Invoices
  "invoice.numberFormat": define(
    z
      .string()
      .max(40)
      .refine((s) => s.includes("{seq}"), "The format must include {seq}")
      // Series are per building prefix and financial year (BILLING_RULES
      // section 9): without both, two series could give the same number.
      .refine(
        (s) => s.includes("{prefix}") && s.includes("{fy}"),
        "The format must include {prefix} and {fy}",
      ),
    "{prefix}/{fy}/{seq}",
    ["billing_entity"],
    "advanced",
  ),
  // The first number to use in each financial year ("2026-27": 412); 1 when absent.
  "invoice.startingNumber": define(
    z.record(z.string().regex(/^\d{4}-\d{2}$/), z.int().min(1)),
    {},
    ["billing_entity"],
    "basic",
  ),
  "invoice.dueDays": define(
    z.int().min(0).max(180),
    7,
    ["building", "tenant"],
    "basic",
  ),
  "invoice.runDay": define(
    z.int().min(1).max(28),
    1,
    ["organization"],
    "basic",
  ),

  // Reminders and alerts
  "reminders.beforeDueDays": define(days, [3], ["organization"], "basic"),
  "reminders.afterDueDays": define(days, [1, 7, 15], ["organization"], "basic"),
  "reminders.autoSend": define(
    z.boolean(),
    true,
    ["organization", "tenant"],
    "basic",
  ),
  "alerts.expiryDays": define(
    days,
    [180, 90, 30],
    ["organization"],
    "advanced",
  ),
  "alerts.increaseDays": define(days, [30, 7], ["organization"], "advanced"),
  "alerts.lockInDays": define(days, [60], ["organization"], "advanced"),
  "alerts.dailyDigest": define(z.boolean(), true, ["organization"], "basic"),

  // Tally export: the accountant's own ledger names (india-compliance skill)
  "tally.ledgerRent": ledger("Rent Income"),
  "tally.ledgerMaintenance": ledger("Maintenance Income"),
  "tally.ledgerOtherIncome": ledger("Other Income"),
  "tally.ledgerCgst": ledger("Output CGST"),
  "tally.ledgerSgst": ledger("Output SGST"),
  "tally.ledgerIgst": ledger("Output IGST"),
  "tally.ledgerTds": ledger("TDS Receivable"),
  "tally.ledgerRoundOff": ledger("Round Off"),
  "tally.ledgerBank": ledger("Bank Account"),
  // The tenant's party ledger in Tally; blank means its company name.
  "tally.partyLedger": define(
    z.string().trim().max(100),
    "",
    ["tenant"],
    "advanced",
  ),
} as const;

/**
 * Settings in docs/SETTINGS.md that are columns rather than jsonb keys,
 * because every row needs its own value.
 */
export const COLUMN_SETTINGS = {
  "billing.waivedDuringRentFree": "lease_charges.waived_during_rent_free (M3)",
  "tds.rateBp": "tenants.tds_rate_bp_<type>",
  "tds.appliesTo": "tenants.deducts_tds_<type>",
  "invoice.prefix": "buildings.invoice_prefix",
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.output<
  (typeof SETTINGS)[K]["schema"]
>;
export type Settings = { [K in SettingKey]: SettingValue<K> };
export type StoredSettings = Partial<Settings>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function defaultSettings(): Settings {
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [key, structuredClone(SETTINGS[key].default)]),
  ) as Settings;
}

export function keysForScope(scope: Scope): SettingKey[] {
  return SETTING_KEYS.filter((key) =>
    (SETTINGS[key].scopes as readonly Scope[]).includes(scope),
  );
}

/** Zod schema for one scope's stored overrides: only that scope's keys, all optional, nothing else. */
export function storedSettingsSchema(scope: Scope) {
  const shape = Object.fromEntries(
    keysForScope(scope).map((key) => [key, SETTINGS[key].schema.optional()]),
  );
  return z.strictObject(shape);
}

export class InvalidSettingsError extends Error {}

/**
 * Validate a scope's stored overrides. Throws rather than falling back to a
 * default: billing must never silently change because of a bad value.
 */
export function parseStoredSettings(
  scope: Scope,
  raw: unknown,
): StoredSettings {
  const result = storedSettingsSchema(scope).safeParse(raw ?? {});
  if (!result.success) {
    throw new InvalidSettingsError(
      `Invalid ${scope} settings: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data as StoredSettings;
}

/** Drop values equal to the default, so only real overrides are stored. */
export function onlyOverrides(values: StoredSettings): StoredSettings {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        value !== undefined &&
        JSON.stringify(value) !==
          JSON.stringify(SETTINGS[key as SettingKey].default),
    ),
  ) as StoredSettings;
}
