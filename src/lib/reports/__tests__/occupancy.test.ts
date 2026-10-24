import { describe, expect, it } from "vitest";
import { leasedUnitIds, occupancyOf } from "../vacancy";

const unit = (
  id: string,
  area: number,
  status: "vacant" | "leased" | "fit_out" | "blocked",
) => ({ id, area, status });

describe("occupancyOf", () => {
  it("counts units from running leases, not their marked status, with fit-out apart", () => {
    // 101 is marked leased but its lease ended; 102 is marked vacant but a
    // lease covers it; 103 is in fit-out with no lease.
    const leased = leasedUnitIds(
      [
        {
          unitId: "101",
          status: "ended",
          startDate: "2023-01-01",
          endDate: "2026-06-30",
        },
        {
          unitId: "102",
          status: "active",
          startDate: "2026-01-01",
          endDate: "2028-12-31",
        },
      ],
      "2026-10-24",
    );
    expect(
      occupancyOf(
        [
          unit("101", 100_000, "leased"),
          unit("102", 300_000, "vacant"),
          unit("103", 100_000, "fit_out"),
        ],
        leased,
      ),
    ).toEqual({
      units: 3,
      vacant: 2,
      fitOut: 1,
      area: 500_000,
      vacantArea: 200_000,
      // 3,000 of 5,000 sq ft leased = 60%.
      leasedPercent: 60,
    });
  });
});
