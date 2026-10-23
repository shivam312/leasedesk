import { describe, expect, it } from "vitest";
import { terminationPlan, type TerminationInput } from "../termination";

const input = (extra: Partial<TerminationInput> = {}): TerminationInput => ({
  lease: { startDate: "2026-04-01", endDate: "2029-03-31", status: "active" },
  charges: [
    { id: "rent", startDate: "2026-04-01" },
    { id: "cam", startDate: "2026-04-01", endDate: "2027-03-31" },
    { id: "signage", startDate: "2028-01-01", endDate: null },
  ],
  criticalDates: [
    { id: "increase-2027", date: "2027-04-01", status: "done" },
    { id: "increase-2028", date: "2028-04-01", status: "open" },
    { id: "expiry", date: "2029-03-31", status: "snoozed" },
  ],
  exitDate: "2027-10-15",
  today: "2027-08-01",
  ...extra,
});

describe("terminationPlan", () => {
  it("ends the lease and its open-ended charges on the exit date", () => {
    expect(terminationPlan(input())).toEqual({
      endDate: "2027-10-15",
      status: "in_notice",
      // CAM already ended on 31-03-2027; signage hasn't started yet.
      shortenCharges: [{ id: "rent", endDate: "2027-10-15" }],
      chargesNeverBilled: ["signage"],
      closeCriticalDates: ["increase-2028", "expiry"],
    });
  });

  it("is terminated straight away when the exit date has passed", () => {
    expect(terminationPlan(input({ today: "2027-10-16" })).status).toBe(
      "terminated",
    );
    // On the exit day itself the tenant is still there.
    expect(terminationPlan(input({ today: "2027-10-15" })).status).toBe(
      "in_notice",
    );
  });

  it("refuses an exit outside the lease, and a lease that isn't running", () => {
    expect(() => terminationPlan(input({ exitDate: "2026-03-31" }))).toThrow(
      "before the lease starts",
    );
    expect(() => terminationPlan(input({ exitDate: "2029-04-01" }))).toThrow(
      "after the lease ends",
    );
    expect(() =>
      terminationPlan(
        input({
          lease: {
            startDate: "2026-04-01",
            endDate: "2029-03-31",
            status: "draft",
          },
        }),
      ),
    ).toThrow("Only an active lease");
  });
});
