import { describe, expect, it } from "vitest";
import { resolveSettings, resolveWithSources } from "../resolve";
import { defaultSettings, InvalidSettingsError } from "../schema";

describe("resolveSettings", () => {
  it("gives every default when nothing is stored", () => {
    expect(resolveSettings({})).toEqual(defaultSettings());
    expect(
      resolveSettings({
        organization: {},
        building: {},
        tenant: {},
        lease: {},
      }),
    ).toEqual(defaultSettings());
  });

  it("uses the organization value over the default", () => {
    const s = resolveSettings({ organization: { "invoice.runDay": 25 } });
    expect(s["invoice.runDay"]).toBe(25);
  });

  it("uses the building over the organization", () => {
    const s = resolveSettings({
      organization: { "billing.roundIncreasedRent": "none" },
      building: { "billing.roundIncreasedRent": "rupee" },
    });
    expect(s["billing.roundIncreasedRent"]).toBe("rupee");
  });

  it("uses the tenant over the building", () => {
    const s = resolveSettings({
      building: { "invoice.dueDays": 10 },
      tenant: { "invoice.dueDays": 15 },
    });
    expect(s["invoice.dueDays"]).toBe(15);
  });

  it("uses the lease over everything else", () => {
    const s = resolveSettings({
      organization: { "billing.roundIncreasedRent": "none" },
      building: { "billing.roundIncreasedRent": "none" },
      lease: { "billing.roundIncreasedRent": "rupee" },
    });
    expect(s["billing.roundIncreasedRent"]).toBe("rupee");
  });

  it("falls through levels that don't set the key", () => {
    const s = resolveSettings({
      organization: { "billing.monthEndRule": "last_day" },
      building: { "invoice.dueDays": 10 },
      tenant: {},
      lease: { "billing.afterCustomIncrease": "resume_rule" },
    });
    expect(s["billing.monthEndRule"]).toBe("last_day");
    expect(s["invoice.dueDays"]).toBe(10);
    expect(s["billing.afterCustomIncrease"]).toBe("resume_rule");
    expect(s["billing.partPeriodMethod"]).toBe("month_by_month");
  });

  it("applies billing-entity numbering settings", () => {
    const s = resolveSettings({
      billingEntity: { "invoice.numberFormat": "{prefix}-{seq}/{fy}" },
    });
    expect(s["invoice.numberFormat"]).toBe("{prefix}-{seq}/{fy}");
  });

  it("refuses a stored value that isn't allowed at its level, rather than ignoring it", () => {
    expect(() => resolveSettings({ lease: { "invoice.runDay": 25 } })).toThrow(
      InvalidSettingsError,
    );
    expect(() =>
      resolveSettings({ building: { "invoice.dueDays": "ten" } }),
    ).toThrow(InvalidSettingsError);
  });
});

describe("resolveWithSources", () => {
  it("says where each value came from", () => {
    const s = resolveWithSources({
      organization: { "invoice.runDay": 25 },
      building: { "invoice.dueDays": 10 },
      tenant: { "invoice.dueDays": 15 },
    });
    expect(s["invoice.runDay"]).toEqual({ value: 25, source: "organization" });
    expect(s["invoice.dueDays"]).toEqual({ value: 15, source: "tenant" });
    expect(s["gst.defaultRateBp"]).toEqual({ value: 1800, source: "default" });
  });
});
