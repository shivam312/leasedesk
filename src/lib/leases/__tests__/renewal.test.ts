import { describe, expect, it } from "vitest";
import { renewalDraft, type RenewableLease } from "../renewal";

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
