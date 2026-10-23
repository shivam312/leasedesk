// Building defaults for billing.defaultTiming, gst.defaultRateBp and
// gst.defaultSac, every option (docs/SETTINGS.md, D16).

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/billing/__tests__/billing-settings";
import { invoiceForRun } from "@/lib/billing/invoice-lines";
import type { LeaseInput } from "@/lib/billing/schedule";
import { withBuildingDefaults, type ChargeDraft } from "../charge-defaults";
import { resolveSettings } from "../resolve";

// ₹12,000 a month utilities, left blank for timing, GST rate and SAC code.
const utilities: ChargeDraft = {
  id: "utilities",
  type: "utilities",
  basis: "fixed",
  amountPaise: 1_200_000,
  startDate: "2026-04-01",
};

const forBuilding = (building: Record<string, unknown>) =>
  resolveSettings({ organization: {}, building });

const runs = (building: Record<string, unknown>) => {
  const lease: LeaseInput = {
    id: "L-B",
    startDate: "2026-04-01",
    endDate: "2029-03-31",
    charges: [withBuildingDefaults(utilities, forBuilding(building))],
  };
  return ["2026-04", "2026-05"].map(
    (run) =>
      invoiceForRun(lease, run, DEFAULT_SETTINGS)?.lines.map((l) => [
        l.periodStart,
        l.periodEnd,
      ]) ?? [],
  );
};

describe("billing.defaultTiming (building)", () => {
  it("advance (default): April is billed in the April run", () => {
    expect(withBuildingDefaults(utilities, forBuilding({})).timing).toBe(
      "advance",
    );
    expect(runs({})).toEqual([
      [["2026-04-01", "2026-04-30"]],
      [["2026-05-01", "2026-05-31"]],
    ]);
  });

  it("arrears: April is billed in the May run; nothing in April", () => {
    expect(runs({ "billing.defaultTiming": "arrears" })).toEqual([
      [],
      [["2026-04-01", "2026-04-30"]],
    ]);
  });

  it("a charge's own timing wins", () => {
    expect(
      withBuildingDefaults(
        { ...utilities, timing: "advance" },
        forBuilding({ "billing.defaultTiming": "arrears" }),
      ).timing,
    ).toBe("advance");
  });
});

describe("gst.defaultRateBp and gst.defaultSac (building)", () => {
  it("defaults: 18% and SAC 997212", () => {
    expect(withBuildingDefaults(utilities, forBuilding({}))).toMatchObject({
      gstRateBp: 1800,
      sacCode: "997212",
    });
  });

  it("a building's own rate and SAC fill a blank charge", () => {
    expect(
      withBuildingDefaults(
        utilities,
        forBuilding({ "gst.defaultRateBp": 1200, "gst.defaultSac": "997211" }),
      ),
    ).toMatchObject({ gstRateBp: 1200, sacCode: "997211" });
  });

  it("a charge's own 0% wins over a building's 18% (0 is a value, not blank)", () => {
    expect(
      withBuildingDefaults(
        { ...utilities, gstRateBp: 0 },
        forBuilding({ "gst.defaultRateBp": 1800 }),
      ).gstRateBp,
    ).toBe(0);
  });

  it("a charge's own SAC wins", () => {
    expect(
      withBuildingDefaults(
        { ...utilities, sacCode: "997212" },
        forBuilding({ "gst.defaultSac": "997211" }),
      ).sacCode,
    ).toBe("997212");
  });
});

describe("changing a building default later", () => {
  it("doesn't move a saved charge: it keeps the timing it was saved with", () => {
    // Saved while the building billed in advance; the building then switches
    // to arrears. Re-timing at billing time would bill May twice.
    const saved = withBuildingDefaults(utilities, forBuilding({}));
    const lease: LeaseInput = {
      id: "L-C",
      startDate: "2026-04-01",
      endDate: "2029-03-31",
      charges: [saved],
    };
    const june = invoiceForRun(lease, "2026-06", DEFAULT_SETTINGS)?.lines.map(
      (l) => l.periodStart,
    );
    expect(june).toEqual(["2026-06-01"]);
  });
});
