import { describe, expect, it } from "vitest";
import { datesSchema, partiesSchema, unitClashes } from "../forms";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const dates = (extra: Record<string, string> = {}) => ({
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  lockInEndDate: "",
  noticePeriodMonths: "3",
  rentFree: "none",
  rentFreeLength: "",
  ...extra,
});

describe("lease form: parties", () => {
  it("needs at least one unit, each once", () => {
    const base = { tenantId: U1, buildingId: U2, areaBasis: "chargeable" };
    expect(partiesSchema.safeParse({ ...base, unitIds: [] }).success).toBe(
      false,
    );
    expect(
      partiesSchema.safeParse({ ...base, unitIds: [U1, U1] }).success,
    ).toBe(false);
    expect(partiesSchema.safeParse({ ...base, unitIds: [U1] }).success).toBe(
      true,
    );
  });
});

describe("lease form: dates", () => {
  it("reads a plain lease with no rent-free period", () => {
    expect(datesSchema.parse(dates())).toEqual({
      startDate: "2026-04-01",
      endDate: "2029-03-31",
      lockInEndDate: null,
      noticePeriodMonths: 3,
      rentFreeMonths: 0,
      rentFreeDays: 0,
    });
  });

  it("stores a rent-free period as months or days, never both", () => {
    expect(
      datesSchema.parse(dates({ rentFree: "months", rentFreeLength: "2" })),
    ).toMatchObject({ rentFreeMonths: 2, rentFreeDays: 0 });
    expect(
      datesSchema.parse(dates({ rentFree: "days", rentFreeLength: "45" })),
    ).toMatchObject({ rentFreeMonths: 0, rentFreeDays: 45 });
  });

  it("asks for the length when a rent-free period is chosen", () => {
    const r = datesSchema.safeParse(dates({ rentFree: "months" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(
      "Enter how many rent-free months.",
    );
  });

  it("refuses an end before the start and a lock-in outside the lease", () => {
    expect(
      datesSchema.safeParse(dates({ endDate: "2026-03-31" })).success,
    ).toBe(false);
    expect(
      datesSchema.safeParse(dates({ lockInEndDate: "2029-04-01" })).success,
    ).toBe(false);
    expect(
      datesSchema.safeParse(dates({ lockInEndDate: "2027-03-31" })).success,
    ).toBe(true);
  });

  it("refuses dates that don't exist", () => {
    expect(
      datesSchema.safeParse(dates({ endDate: "2029-02-30" })).success,
    ).toBe(false);
  });
});

describe("unitClashes", () => {
  const booking = {
    leaseId: "old",
    unitId: U1,
    startDate: "2023-04-01",
    endDate: "2026-03-31",
  };
  const lease = {
    unitIds: [U1],
    startDate: "2026-04-01",
    endDate: "2029-03-31",
  };

  it("allows a lease that starts the day after the last one ends", () => {
    expect(unitClashes(lease, [booking])).toEqual([]);
  });

  it("finds a unit still let on the new start date", () => {
    expect(
      unitClashes({ ...lease, startDate: "2026-03-31" }, [booking]),
    ).toEqual([booking]);
  });

  it("ignores other units, the lease itself and the version it renews", () => {
    const overlapping = { ...lease, startDate: "2025-01-01" };
    expect(unitClashes({ ...overlapping, unitIds: [U2] }, [booking])).toEqual(
      [],
    );
    expect(unitClashes({ ...overlapping, id: "old" }, [booking])).toEqual([]);
    expect(
      unitClashes({ ...overlapping, replacesLeaseId: "old" }, [booking]),
    ).toEqual([]);
  });
});
