import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COLUMN_SETTINGS,
  defaultSettings,
  InvalidSettingsError,
  keysForScope,
  onlyOverrides,
  parseStoredSettings,
  SETTING_KEYS,
  SETTINGS,
  type Scope,
} from "../schema";

interface DocRow {
  key: string;
  scopes: Scope[];
  defaultText: string;
  shown: string;
}

/** The setting rows of docs/SETTINGS.md. */
function docRows(): DocRow[] {
  const doc = readFileSync("docs/SETTINGS.md", "utf8");
  return doc
    .split("\n")
    .filter((line) => /^\| \[[ x]\] \| `/.test(line))
    .map((line) => {
      const cells = line.split(" | ").map((c) => c.trim());
      const scopes = cells[2]!
        .split(", ")
        .map((s) => s.replace("billing entity", "billing_entity"))
        .filter((s) => !["charge", "per FY", "per charge type"].includes(s));
      return {
        key: cells[1]!.replace(/`/g, ""),
        scopes: scopes as Scope[],
        defaultText: /`([^`]*)`/.exec(cells[4]!)?.[1] ?? cells[4]!,
        shown: cells[5]!.split(" ")[0]!,
      };
    });
}

describe("settings schema matches docs/SETTINGS.md", () => {
  const rows = docRows();
  const jsonbRows = rows.filter((r) => !(r.key in COLUMN_SETTINGS));

  it("finds the settings table in the doc", () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  it("has every documented key, either as a jsonb setting or a known column", () => {
    expect(jsonbRows.map((r) => r.key).sort()).toEqual(
      [...SETTING_KEYS].sort(),
    );
    for (const key of Object.keys(COLUMN_SETTINGS))
      expect(rows.map((r) => r.key)).toContain(key);
  });

  it.each(jsonbRows.map((r) => [r.key, r] as const))(
    "%s has the documented default, scopes and visibility",
    (key, row) => {
      const def = SETTINGS[key as keyof typeof SETTINGS];
      const expected =
        typeof def.default === "string"
          ? def.default
          : JSON.stringify(def.default);
      expect(expected).toBe(row.defaultText.replace(/\s/g, ""));
      expect([...def.scopes].sort()).toEqual([...row.scopes].sort());
      expect(def.shown).toBe(row.shown);
    },
  );

  it("every default passes its own schema", () => {
    for (const key of SETTING_KEYS)
      expect(
        SETTINGS[key].schema.safeParse(SETTINGS[key].default).success,
      ).toBe(true);
  });
});

describe("parseStoredSettings", () => {
  it("accepts an empty object and missing settings", () => {
    expect(parseStoredSettings("organization", {})).toEqual({});
    expect(parseStoredSettings("lease", null)).toEqual({});
  });

  it("accepts valid overrides for the scope", () => {
    expect(
      parseStoredSettings("building", {
        "invoice.dueDays": 10,
        "gst.defaultSac": "997212",
      }),
    ).toEqual({ "invoice.dueDays": 10, "gst.defaultSac": "997212" });
  });

  it("refuses a key that can't be set at this scope", () => {
    // Invoice total rounding is organization-wide only.
    expect(() =>
      parseStoredSettings("lease", { "billing.roundInvoiceTotal": "none" }),
    ).toThrow(InvalidSettingsError);
  });

  it("refuses unknown keys and bad values instead of falling back", () => {
    expect(() =>
      parseStoredSettings("organization", { "billing.typo": 1 }),
    ).toThrow(InvalidSettingsError);
    expect(() =>
      parseStoredSettings("organization", { "invoice.runDay": 31 }),
    ).toThrow(InvalidSettingsError);
    expect(() =>
      parseStoredSettings("billing_entity", {
        "invoice.numberFormat": "{prefix}/{fy}",
      }),
    ).toThrow(/seq/);
  });
});

describe("helpers", () => {
  it("defaultSettings returns a fresh copy each time", () => {
    const a = defaultSettings();
    a["reminders.afterDueDays"].push(30);
    expect(defaultSettings()["reminders.afterDueDays"]).toEqual([1, 7, 15]);
  });

  it("keysForScope lists the lease-level keys", () => {
    expect(keysForScope("lease").sort()).toEqual([
      "billing.afterCustomIncrease",
      "billing.monthEndRule",
      "billing.partPeriodMethod",
      "billing.roundIncreasedRent",
    ]);
  });

  it("onlyOverrides drops values equal to the default", () => {
    expect(
      onlyOverrides({
        "invoice.dueDays": 7,
        "invoice.runDay": 25,
        "reminders.beforeDueDays": [3],
      }),
    ).toEqual({ "invoice.runDay": 25 });
  });
});
