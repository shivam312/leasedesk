import { describe, expect, it } from "vitest";
import { billingSettings } from "@/lib/settings/billing";
import { defaultSettings } from "@/lib/settings/schema";
import { criticalDatesFor } from "../critical-dates";

const settings = defaultSettings();

const lease = {
  id: "L1",
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  lockInEndDate: "2027-03-31",
  noticePeriodMonths: 3,
  charges: [
    {
      id: "rent",
      type: "rent" as const,
      basis: "fixed" as const,
      amountPaise: 10000000,
      startDate: "2026-04-01",
      timing: "advance" as const,
      gstRateBp: 1800,
      sacCode: "997212",
    },
  ],
  escalationRules: [
    { percentBp: 500, everyMonths: 12, anchor: "lease_start" as const },
  ],
};

describe("criticalDatesFor", () => {
  it("makes expiry, lock-in end, notice deadline and each rent increase", () => {
    expect(
      criticalDatesFor(lease, billingSettings(settings), settings),
    ).toEqual([
      { type: "lock_in_end", date: "2027-03-31", remindDays: [60] },
      // Increases on 01-04-2027 and 01-04-2028 (5% every 12 months from the start).
      { type: "escalation", date: "2027-04-01", remindDays: [30, 7] },
      { type: "escalation", date: "2028-04-01", remindDays: [30, 7] },
      // Three months' notice to leave at the end: give it by 31-12-2028.
      { type: "notice_deadline", date: "2028-12-31", remindDays: [30, 7] },
      { type: "expiry", date: "2029-03-31", remindDays: [180, 90, 30] },
    ]);
  });

  it("leaves out what the lease doesn't have, and follows the alert settings", () => {
    const plain = {
      ...lease,
      lockInEndDate: null,
      noticePeriodMonths: null,
      escalationRules: [],
    };
    expect(
      criticalDatesFor(plain, billingSettings(settings), {
        ...settings,
        "alerts.expiryDays": [90],
      }),
    ).toEqual([{ type: "expiry", date: "2029-03-31", remindDays: [90] }]);
  });
});
