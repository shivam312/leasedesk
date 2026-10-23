import { describe, expect, it } from "vitest";
import { SETTING_LABELS, shownKeys } from "../labels";
import {
  fieldName,
  percentToBp,
  readSettingsForm,
  rupeesToPaise,
  toFieldValue,
} from "../rules-form";
import { keysForScope, SETTINGS, type SettingKey } from "../schema";

const form = (values: Partial<Record<SettingKey, string>>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values))
    data.set(fieldName(k as SettingKey), v);
  return data;
};

describe("amounts typed in rupees and percent", () => {
  it("rupees → paise without floats", () => {
    expect(rupeesToPaise("1")).toBe(100);
    expect(rupeesToPaise("0.5")).toBe(50);
    expect(rupeesToPaise("12.05")).toBe(1205);
    expect(rupeesToPaise("1.234")).toBeNull();
    expect(rupeesToPaise("-1")).toBeNull();
  });

  it("percent → basis points", () => {
    expect(percentToBp("18")).toBe(1800);
    expect(percentToBp("12.5")).toBe(1250);
    expect(percentToBp("abc")).toBeNull();
  });

  it("shows stored values the way they're typed", () => {
    expect(toFieldValue("gst.defaultRateBp", 1250)).toBe("12.50");
    expect(toFieldValue("gst.defaultRateBp", 1800)).toBe("18");
    expect(toFieldValue("tds.tolerancePaise", 150)).toBe("1.50");
    expect(toFieldValue("invoice.dueDays", undefined)).toBe("");
  });
});

describe("what the page shows", () => {
  it("every shown setting has a label, and only built settings are shown", () => {
    expect(shownKeys("organization", keysForScope)).not.toContain(
      "reminders.autoSend",
    );
    expect(shownKeys("building", keysForScope).sort()).toEqual([
      "billing.defaultTiming",
      "billing.roundIncreasedRent",
      "gst.defaultRateBp",
      "gst.defaultSac",
      "invoice.dueDays",
    ]);
  });

  it("every choice offers exactly the setting's options", () => {
    for (const [key, label] of Object.entries(SETTING_LABELS)) {
      if (label.input.kind !== "choice") continue;
      for (const option of Object.keys(label.input.options))
        expect(
          SETTINGS[key as SettingKey].schema.safeParse(option).success,
          `${key}: ${option}`,
        ).toBe(true);
    }
  });
});

describe("readSettingsForm", () => {
  it("organization: reads every field; blank means the default", () => {
    const keys = shownKeys("organization", keysForScope);
    const result = readSettingsForm(
      "organization",
      keys,
      form({
        "billing.roundIncreasedRent": "none",
        "billing.skipZeroInvoices": "false",
        "tds.tolerancePaise": "2.50",
      }),
    );
    expect(result).toMatchObject({
      values: {
        "billing.roundIncreasedRent": "none",
        "billing.skipZeroInvoices": false,
        "tds.tolerancePaise": 250,
        "gst.rounding": "per_line",
      },
    });
  });

  it("building: blank means 'same as the organization', so it isn't stored", () => {
    const keys = shownKeys("building", keysForScope);
    expect(
      readSettingsForm(
        "building",
        keys,
        form({ "invoice.dueDays": "10", "gst.defaultRateBp": "12" }),
      ),
    ).toEqual({ values: { "invoice.dueDays": 10, "gst.defaultRateBp": 1200 } });
  });

  it("explains bad input in plain words", () => {
    const keys = shownKeys("building", keysForScope);
    expect(
      readSettingsForm(
        "building",
        keys,
        form({
          "invoice.dueDays": "ten",
          "gst.defaultRateBp": "18%",
          "gst.defaultSac": "9972",
        }),
      ),
    ).toEqual({
      errors: {
        invoice__dueDays: "Enter a whole number of days, 0 to 180.",
        gst__defaultRateBp: "Enter a percentage like 18 or 12.5.",
        gst__defaultSac: "A SAC code is 6 digits, like 997212.",
      },
    });
  });
});
