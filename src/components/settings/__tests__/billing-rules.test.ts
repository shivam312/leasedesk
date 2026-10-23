import { describe, expect, it } from "vitest";
import { SETTING_LABELS } from "@/lib/settings/labels";
import { fieldName } from "@/lib/settings/rules-form";
import { keysForScope } from "@/lib/settings/schema";
import { billingRuleFields, describeValue } from "../billing-rules";

describe("describeValue", () => {
  it("reads reminder days in words", () => {
    expect(describeValue("reminders.afterDueDays", [1, 7, 15])).toBe(
      "1, 7, 15 days",
    );
    expect(describeValue("reminders.beforeDueDays", [1])).toBe("1 day");
    expect(describeValue("reminders.beforeDueDays", [])).toBe("None");
  });

  it("shows rupee settings with Indian grouping (formatINR)", () => {
    // 1,00,000 rupees = 1,00,00,000 paise.
    expect(describeValue("tds.tolerancePaise", 10_000_000)).toBe("₹1,00,000");
    expect(describeValue("tds.tolerancePaise", 100)).toBe("₹1");
    expect(describeValue("tds.tolerancePaise", 150)).toBe("₹1.50");
  });

  it("shows the run day as a day of the month", () => {
    expect(describeValue("invoice.runDay", 1)).toBe("The 1st");
    expect(describeValue("invoice.runDay", 22)).toBe("The 22nd");
    expect(describeValue("invoice.runDay", 13)).toBe("The 13th");
    expect(describeValue("invoice.runDay", 25)).toBe("The 25th");
  });

  it("says day or days to match the number", () => {
    expect(describeValue("invoice.dueDays", 1)).toBe("1 day");
    expect(describeValue("invoice.dueDays", 7)).toBe("7 days");
    expect(describeValue("invoice.dueDays", 0)).toBe("0 days");
  });
});

describe("billingRuleFields", () => {
  it("has a field for every setting a lease, building or organization can set", () => {
    for (const scope of ["organization", "building", "lease"] as const) {
      const keys = keysForScope(scope).filter((k) => SETTING_LABELS[k]);
      expect(billingRuleFields(keysForScope(scope), {}).length).toBe(
        keys.length,
      );
    }
    expect(
      billingRuleFields(keysForScope("lease"), {}).map((f) => f.name),
    ).toContain(fieldName("billing.afterCustomIncrease"));
  });

  it("leaves out a setting that isn't on screen yet", () => {
    expect(billingRuleFields(["alerts.expiryDays"], {})).toEqual([]);
  });

  it("reminder days: typed as a list, blank allowed (no reminders)", () => {
    const [field] = billingRuleFields(["reminders.afterDueDays"], {});
    expect(field).toMatchObject({
      name: "reminders__afterDueDays",
      defaultValue: "1, 7, 15",
      required: false,
      inputMode: undefined,
    });
  });
});
