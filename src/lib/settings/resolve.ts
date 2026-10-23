// Settings resolution: lease → tenant → building → organization → default.
// The most specific stored value wins. Billing-entity keys (invoice numbering)
// can only be set on the billing entity, so they don't compete with the others.
// This is the only place that reads stored settings (docs/AUTONOMY.md); it is
// pure, so the billing engine can be handed its result.

import {
  defaultSettings,
  parseStoredSettings,
  SETTING_KEYS,
  type Scope,
  type SettingKey,
  type Settings,
  type StoredSettings,
} from "./schema";

/** The raw `settings` jsonb of each level that applies; omit levels that don't. */
export interface SettingLayers {
  organization?: unknown;
  billingEntity?: unknown;
  building?: unknown;
  tenant?: unknown;
  lease?: unknown;
}

export type Source = Scope | "default";

/** Most specific first. */
const ORDER: readonly [keyof SettingLayers, Scope][] = [
  ["lease", "lease"],
  ["tenant", "tenant"],
  ["building", "building"],
  ["billingEntity", "billing_entity"],
  ["organization", "organization"],
];

function parsedLayers(layers: SettingLayers): [Scope, StoredSettings][] {
  return ORDER.filter(([level]) => layers[level] !== undefined).map(
    ([level, scope]) => [scope, parseStoredSettings(scope, layers[level])],
  );
}

/** Every setting's value and the level it came from. */
export function resolveWithSources(layers: SettingLayers): {
  [K in SettingKey]: { value: Settings[K]; source: Source };
} {
  const parsed = parsedLayers(layers);
  const defaults = defaultSettings();
  return Object.fromEntries(
    SETTING_KEYS.map((key) => {
      const hit = parsed.find(([, stored]) => stored[key] !== undefined);
      return [
        key,
        hit
          ? { value: hit[1][key], source: hit[0] }
          : { value: defaults[key], source: "default" },
      ];
    }),
  ) as { [K in SettingKey]: { value: Settings[K]; source: Source } };
}

/** Every setting's effective value. Throws if any stored layer is invalid. */
export function resolveSettings(layers: SettingLayers): Settings {
  const withSources = resolveWithSources(layers);
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [key, withSources[key].value]),
  ) as Settings;
}
