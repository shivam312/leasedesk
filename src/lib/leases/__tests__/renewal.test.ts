import { describe, expect, it } from "vitest";
import {
  renewalDraft,
  renewalStartProblem,
  type RenewableLease,
} from "../renewal";

const lease: RenewableLease = {
  id: "L1",
  tenantId: "t1",
  unitIds: ["u1", "u2"],
  version: 1,
  status: "active",
  endDate: "2029-03-31",
  buildingId: "b1",
  areaBasis: "chargeable",
  noticePeriodMonths: 3,
  rentFreeMonths: 2,
  rentFreeDays: 0,
  settings: {},
  charges: [],
  escalationRules: [{ percentBp: 500, everyMonths: 12, anchor: "lease_start" }],
};

const settings = { monthEndRule: "roll_forward" as const };

describe("renewalDraft", () => {
  it("starts the day after the old lease ends, as the next version", () => {
    // 36 months from 01-04-2029 ends on 31-03-2032.
    expect(renewalDraft(lease, 36, settings)).toMatchObject({
      tenantId: "t1",
      unitIds: ["u1", "u2"],
      version: 2,
      replacesLeaseId: "L1",
      startDate: "2029-04-01",
      endDate: "2032-03-31",
      rentFreeMonths: 0,
      escalationRules: [
        { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
      ],
    });
  });

  it("refuses a draft, an already renewed lease and a bad term", () => {
    expect(() =>
      renewalDraft({ ...lease, status: "draft" }, 36, settings),
    ).toThrow("A draft lease can't be renewed");
    expect(() =>
      renewalDraft({ ...lease, status: "renewed" }, 36, settings),
    ).toThrow("already been renewed");
    expect(() => renewalDraft(lease, 0, settings)).toThrow("whole months");
  });
});

describe("renewalStartProblem", () => {
  it("refuses a renewal that starts before the old version ends", () => {
    // Old lease ends 31-03-2027; a renewal from 01-01-2027 would bill
    // Jan–Mar 2027 twice for the same units.
    expect(renewalStartProblem("2027-03-31", "2027-01-01")).toBe(
      "The renewal must start after the current lease ends on 31-03-2027.",
    );
    expect(renewalStartProblem("2027-03-31", "2027-03-31")).not.toBeNull();
    expect(renewalStartProblem("2027-03-31", "2027-04-01")).toBeNull();
  });
});
