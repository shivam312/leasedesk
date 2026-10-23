// Form fields for Settings → Billing rules.

import type { FormField } from "@/components/forms/SimpleForm";
import { formatINR } from "@/lib/format";
import { SETTING_LABELS } from "@/lib/settings/labels";
import { fieldName, toFieldValue } from "@/lib/settings/rules-form";
import {
  SETTINGS,
  type Settings,
  type SettingKey,
  type StoredSettings,
} from "@/lib/settings/schema";

/** 1 → "1st", 22 → "22nd", 25 → "25th". */
function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? "st"
      : n % 10 === 2 && n !== 12
        ? "nd"
        : n % 10 === 3 && n !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

/** How a value reads in words, e.g. "In advance", "18%", "7 days". */
export function describeValue(key: SettingKey, value: unknown): string {
  const input = SETTING_LABELS[key]?.input;
  switch (input?.kind) {
    case "choice":
      return input.options[String(value)] ?? String(value);
    case "boolean":
      return value ? input.yes : input.no;
    case "percent":
      return `${toFieldValue(key, value)}%`;
    case "rupees":
      return formatINR(value as number);
    case "days":
      return `${String(value)} ${value === 1 ? "day" : "days"}`;
    case "dayOfMonth":
      return `The ${ordinal(Number(value))}`;
    case "dayList": {
      const list = value as number[];
      return list.length === 0
        ? "None"
        : `${list.join(", ")} ${list.length === 1 && list[0] === 1 ? "day" : "days"}`;
    }
    default:
      return String(value);
  }
}

/**
 * Fields for the organization (`inherited` undefined: every field filled in)
 * or a building (a blank field follows `inherited`, the organization's value).
 * Settings without a label in `SETTING_LABELS` aren't on screen yet and are
 * left out.
 */
export function billingRuleFields(
  keys: SettingKey[],
  stored: StoredSettings,
  inherited?: Settings,
): FormField[] {
  return keys.flatMap((key) => {
    const label = SETTING_LABELS[key];
    if (!label) return [];
    const def = SETTINGS[key];
    const current = stored[key];
    const fallback = inherited?.[key] ?? def.default;
    const fallbackWords = describeValue(key, fallback);
    const base = {
      name: fieldName(key),
      label: label.label,
      hint: label.help,
      advanced: def.shown === "advanced",
      required: true,
    };
    const { input } = label;
    if (input.kind === "choice" || input.kind === "boolean") {
      const options =
        input.kind === "choice"
          ? Object.entries(input.options).map(([value, text]) => ({
              value,
              label: text,
            }))
          : [
              { value: "true", label: input.yes },
              { value: "false", label: input.no },
            ];
      return {
        ...base,
        type: "select" as const,
        options: inherited
          ? [
              { value: "", label: `Same as your business: ${fallbackWords}` },
              ...options,
            ]
          : options,
        defaultValue:
          current !== undefined
            ? String(current)
            : inherited
              ? ""
              : String(def.default),
      };
    }
    return {
      ...base,
      // A day list needs a comma, which number keypads don't have.
      inputMode:
        input.kind === "dayList"
          ? undefined
          : input.kind === "text"
            ? ("numeric" as const)
            : ("decimal" as const),
      defaultValue: toFieldValue(
        key,
        current ?? (inherited ? undefined : def.default),
      ),
      hint: inherited
        ? `${label.help} Leave blank for ${fallbackWords}.`
        : label.help,
      // A blank day list means no reminders of that kind.
      required: !inherited && input.kind !== "dayList",
    };
  });
}
