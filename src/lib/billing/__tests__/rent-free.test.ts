import { describe, expect, it } from "vitest";
import { chargeBillingWindow, rentCommencement } from "../rent-free";
import type { Charge, LeaseTerms } from "../types";

const lease: LeaseTerms = {
  id: "L-104",
  startDate: "2027-01-01",
  endDate: "2029-12-31",
};

const rent: Charge = {
  id: "rent",
  type: "rent",
  basis: "fixed",
  amountPaise: 20_000_000,
  startDate: "2027-01-01",
  gstRateBp: 1800,
  sacCode: "997212",
};

const cam: Charge = {
  ...rent,
  id: "cam",
  type: "cam",
  amountPaise: 2_500_000,
};

describe("rentCommencement", () => {
  it("is the lease start when there is no rent-free period", () => {
    expect(rentCommencement(lease).date).toBe("2027-01-01");
  });

  it("adds rent-free months to the lease start", () => {
    // 1 Jan 2027 + 3 months = 1 Apr 2027
    const result = rentCommencement({ ...lease, rentFreeMonths: 3 });
    expect(result.date).toBe("2027-04-01");
    expect(result.steps).toEqual([
      "Lease starts on 01-01-2027",
      "3 rent-free months",
      "Rent starts on 01-04-2027",
    ]);
  });

  it("adds rent-free days to the lease start", () => {
    // 1 Sep 2026 + 15 days = 16 Sep 2026 (1–15 Sep free)
    expect(
      rentCommencement({
        ...lease,
        startDate: "2026-09-01",
        rentFreeDays: 15,
      }).date,
    ).toBe("2026-09-16");
    // 1 Jan 2027 + 45 days = 15 Feb 2027 (31 Jan days + 14 Feb days free)
    expect(rentCommencement({ ...lease, rentFreeDays: 45 }).date).toBe(
      "2027-02-15",
    );
  });

  it("treats zero as no rent-free period", () => {
    expect(rentCommencement({ ...lease, rentFreeMonths: 0 }).date).toBe(
      "2027-01-01",
    );
  });

  it("refuses both months and days, or negative values", () => {
    expect(() =>
      rentCommencement({ ...lease, rentFreeMonths: 1, rentFreeDays: 10 }),
    ).toThrow(/L-104/);
    expect(() => rentCommencement({ ...lease, rentFreeMonths: -1 })).toThrow(
      RangeError,
    );
    expect(() => rentCommencement({ ...lease, rentFreeDays: 1.5 })).toThrow(
      RangeError,
    );
  });
});

describe("chargeBillingWindow", () => {
  const rentFree = { ...lease, rentFreeMonths: 3 };

  it("starts rent at rent commencement; CAM from the lease start", () => {
    // Golden 3: rent waived Jan–Mar 2027, CAM billed from January
    expect(chargeBillingWindow(rent, rentFree)).toEqual({
      from: "2027-04-01",
      to: "2029-12-31",
    });
    expect(chargeBillingWindow(cam, rentFree)).toEqual({
      from: "2027-01-01",
      to: "2029-12-31",
    });
  });

  it("follows waivedDuringRentFree when set", () => {
    expect(
      chargeBillingWindow({ ...cam, waivedDuringRentFree: true }, rentFree)
        ?.from,
    ).toBe("2027-04-01");
    expect(
      chargeBillingWindow({ ...rent, waivedDuringRentFree: false }, rentFree)
        ?.from,
    ).toBe("2027-01-01");
  });

  it("uses the charge's own dates inside the lease", () => {
    expect(
      chargeBillingWindow(
        { ...cam, startDate: "2027-06-01", endDate: "2028-05-31" },
        rentFree,
      ),
    ).toEqual({ from: "2027-06-01", to: "2028-05-31" });
  });

  it("never bills outside the lease", () => {
    expect(
      chargeBillingWindow(
        { ...cam, startDate: "2026-12-01", endDate: "2030-06-30" },
        rentFree,
      ),
    ).toEqual({ from: "2027-01-01", to: "2029-12-31" });
  });

  it("is empty when a waived charge ends before rent starts", () => {
    expect(
      chargeBillingWindow({ ...rent, endDate: "2027-03-31" }, rentFree),
    ).toBeNull();
  });

  it("rejects a lease that ends before it starts", () => {
    expect(() =>
      chargeBillingWindow(rent, { ...lease, endDate: "2026-12-31" }),
    ).toThrow(/L-104/);
  });
});
