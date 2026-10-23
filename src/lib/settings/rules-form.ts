// Turning the Billing rules form into stored settings and back. A blank field
// at building level means "same as the organization" (the key isn't stored).

import { SETTING_LABELS } from "./labels";
import {
  SETTINGS,
  type Scope,
  type SettingKey,
  type StoredSettings,
} from "./schema";

/** Form field name for a setting key ("." isn't safe in every form library). */
export const fieldName = (key: SettingKey) => key.replace(".", "__");

/** "1.5" → 150 paise; null if it isn't a rupee amount with at most 2 decimals. */
export function rupeesToPaise(text: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** "18" or "12.5" → basis points; null if it isn't a percent with at most 2 decimals. */
export function percentToBp(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** A stored value as the form shows it. */
export function toFieldValue(key: SettingKey, value: unknown): string {
  const input = SETTING_LABELS[key]?.input;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (input?.kind === "percent" || input?.kind === "rupees") {
    const n = Number(value);
    const whole = Math.trunc(n / 100);
    const fraction = n % 100;
    return fraction === 0
      ? String(whole)
      : `${whole}.${String(fraction).padStart(2, "0")}`;
  }
  return String(value);
}

/**
 * Read the settings for `keys` from the form. Returns the values to store,
 * or a plain-words error per field.
 */
export function readSettingsForm(
  scope: Scope,
  keys: SettingKey[],
  form: FormData,
): { values: StoredSettings } | { errors: Record<string, string> } {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const key of keys) {
    const raw = String(form.get(fieldName(key)) ?? "").trim();
    const input = SETTING_LABELS[key]?.input;
    if (input?.kind === "dayList") {
      const value = readDayList(raw);
      const parsed = SETTINGS[key].schema.safeParse(value);
      if (parsed.success) values[key] = parsed.data;
      else errors[fieldName(key)] = messageFor(key);
      continue;
    }
    if (raw === "") {
      if (scope === "organization") values[key] = SETTINGS[key].default;
      continue;
    }
    let value: unknown = raw;
    if (input?.kind === "boolean") value = raw === "true";
    if (input?.kind === "days" || input?.kind === "dayOfMonth")
      value = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (input?.kind === "percent") value = percentToBp(raw);
    if (input?.kind === "rupees") value = rupeesToPaise(raw);
    const parsed = SETTINGS[key].schema.safeParse(value);
    if (parsed.success) values[key] = parsed.data;
    else errors[fieldName(key)] = messageFor(key);
  }
  return Object.keys(errors).length > 0
    ? { errors }
    : { values: values as StoredSettings };
}

/** "15, 7 1,7" → [1, 7, 15]; blank → []; null if any part isn't a whole number. */
function readDayList(raw: string): number[] | null {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

function messageFor(key: SettingKey): string {
  switch (SETTING_LABELS[key]?.input.kind) {
    case "percent":
      return "Enter a percentage like 18 or 12.5.";
    case "rupees":
      return "Enter an amount in rupees, like 1 or 0.50.";
    case "days":
      return "Enter a whole number of days, 0 to 180.";
    case "dayOfMonth":
      return "Enter a day of the month from 1 to 28.";
    case "dayList":
      return "Enter days as numbers separated by commas, like 1, 7, 15.";
    default:
      return key === "gst.defaultSac"
        ? "A SAC code is 6 digits, like 997212."
        : "Choose one of the options.";
  }
}
