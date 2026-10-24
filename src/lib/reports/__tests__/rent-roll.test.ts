import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/billing/__tests__/billing-settings";
import type { Charge } from "@/lib/billing/types";
import { expirySchedule } from "../expiry";
import { rentFigures, rentRoll, type RentRollLease } from "../rent-roll";
import { vacancy, type VacancyUnit } from "../vacancy";

const rent = (over: Partial<Charge> = {}): Charge =>
  ({
    id: "rent",
    type: "rent",
    basis: "per_sqft",
    ratePaise: 8_550,
    areaHundredths: 125_050,
    startDate: "2025-04-01",
    gstRateBp: 1800,
    sacCode: "997212",
    ...over,
  }) as Charge;

const lease = (over: Partial<RentRollLease> = {}): RentRollLease => ({
  leaseId: "l1",
  status: "active",
  tenantName: "Acme Software Pvt Ltd",
  buildingName: "Orchid Towers",
  unitCodes: ["301", "302"],
  area: 125_050,
  startDate: "2025-04-01",
  endDate: "2030-03-31",
  rentStartsOn: "2025-04-01",
  lockInEndDate: "2027-03-31",
  noticePeriodMonths: 3,
  depositPaise: 64_150_050,
  input: {
    id: "l1",
    startDate: "2025-04-01",
    endDate: "2030-03-31",
    charges: [
      rent(),
      {
        id: "cam",
        type: "cam",
        basis: "fixed",
        amountPaise: 3_000_000,
        frequency: "quarterly",
        startDate: "2025-04-01",
        gstRateBp: 1800,
        sacCode: "997212",
      },
    ],
    escalationRules: [
      { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
    ],
  },
  settings: DEFAULT_SETTINGS,
  ...over,
});

describe("rentFigures", () => {
  it("before any increase: the lease rate and the base rent", () => {
    // 1,250.50 sq ft × ₹85.50 = ₹1,06,917.75 (8550 × 125050 ÷ 100 = 10691775)
    const f = rentFigures(lease(), "2025-10-23");
    expect(f.rent).toBe(10_691_775);
    expect(f.ratePerSqft).toBe(8_550);
    // Maintenance ₹30,000 a quarter ÷ 3 = ₹10,000 a month
    expect(f.otherCharges).toBe(1_000_000);
    // First increase on 01-04-2026: ₹1,06,917.75 × 1.05 = ₹1,12,263.6375,
    // rounded to the rupee (billing.roundIncreasedRent = rupee) = ₹1,12,264
    expect(f.nextIncrease).toEqual({ date: "2026-04-01", rent: 11_226_400 });
  });

  it("after an increase: rent ÷ area for the rate, and the following increase", () => {
    // Rent from 01-04-2026 is ₹1,12,264; rate = 11226400 × 100 ÷ 125050
    // = 8977.52... → 8978 paise (₹89.78), half up
    const f = rentFigures(lease(), "2026-10-23");
    expect(f.rent).toBe(11_226_400);
    expect(f.ratePerSqft).toBe(8_978);
    // 01-04-2027: ₹1,12,264 × 1.05 = ₹1,17,877.20 → ₹1,17,877
    expect(f.nextIncrease).toEqual({ date: "2027-04-01", rent: 11_787_700 });
  });

  it("has no next increase in the lease's last year", () => {
    expect(rentFigures(lease(), "2029-10-01").nextIncrease).toBeNull();
  });

  it("with exact paise (roundIncreasedRent = none) keeps the paise", () => {
    // ₹1,06,917.75 × 1.05 = ₹1,12,263.6375 → ₹1,12,263.64 (to the paisa)
    const f = rentFigures(
      lease({
        settings: { ...DEFAULT_SETTINGS, roundIncreasedRent: "none" },
      }),
      "2026-04-01",
    );
    expect(f.rent).toBe(11_226_364);
  });

  it("no area: no rate", () => {
    expect(
      rentFigures(lease({ area: 0 }), "2025-10-23").ratePerSqft,
    ).toBeNull();
  });
});

describe("rentRoll", () => {
  it("lists leases running on the date, with totals", () => {
    const report = rentRoll(
      [
        lease(),
        lease({
          leaseId: "old",
          endDate: "2025-03-31",
          startDate: "2024-04-01",
        }),
        lease({ leaseId: "d", status: "draft" }),
      ],
      "2025-10-23",
    );
    const [section] = report.sections;
    expect(section!.rows).toHaveLength(1);
    expect(section!.rows[0]).toMatchObject({
      units: "301, 302",
      status: "Active",
      rent: 10_691_775,
      nextIncrease: "2026-04-01",
    });
    expect(section!.totals).toMatchObject({ rent: 10_691_775, area: 125_050 });
    expect(report.period).toBe("As on 23-10-2025");
  });

  it("is empty without running leases", () => {
    const report = rentRoll([], "2025-10-23");
    // On a phone each card is headed by the unit.
    expect(report.sections[0]!.anchor).toBe("units");
    expect(report.sections[0]!.rows).toEqual([]);
    expect(report.sections[0]!.totals).toBeUndefined();
  });
});

describe("vacancy", () => {
  const unit = (over: Partial<VacancyUnit>): VacancyUnit => ({
    id: "u1",
    buildingName: "Orchid Towers",
    floorLabel: "3",
    code: "301",
    area: 100_000,
    status: "vacant",
    ...over,
  });

  it("counts a unit leased only when a saved lease covers the date", () => {
    const report = vacancy(
      [
        unit({ id: "u1", code: "301" }),
        unit({ id: "u2", code: "302", area: 300_000, status: "leased" }),
        unit({ id: "u3", code: "303", status: "fit_out" }),
      ],
      [
        {
          unitId: "u1",
          status: "active",
          startDate: "2025-01-01",
          endDate: "2027-12-31",
        },
        // Ended 30-06-2026 → vacant since 01-07-2026
        {
          unitId: "u2",
          status: "expired",
          startDate: "2023-07-01",
          endDate: "2026-06-30",
        },
        {
          unitId: "u2",
          status: "draft",
          startDate: "2026-11-01",
          endDate: "2029-10-31",
        },
        {
          unitId: "u3",
          status: "active",
          startDate: "2026-12-01",
          endDate: "2031-11-30",
        },
      ],
      "2026-10-23",
    );
    const [summary, vacant] = report.sections;
    // 5,000 sq ft in all; 1,000 leased → 20%
    expect(summary!.rows).toEqual([
      {
        building: "Orchid Towers",
        units: 3,
        vacantUnits: 2,
        area: 500_000,
        vacantArea: 400_000,
        leasedPercent: 2_000,
      },
    ]);
    expect(vacant!.rows).toEqual([
      expect.objectContaining({
        unit: "302",
        since: "2026-07-01",
        history: "",
        nextLease: null,
        marked: "",
      }),
      expect.objectContaining({
        unit: "303",
        since: null,
        history: "Never leased",
        nextLease: "2026-12-01",
        marked: "Fit-out",
      }),
    ]);
  });
});

describe("expirySchedule", () => {
  it("lists running leases ending in the next 12 months, soonest first", () => {
    const report = expirySchedule(
      [
        lease(),
        // Ends 31-03-2027, notice 3 months: last day to give notice is
        // 01-04-2027 − 3 months − 1 day = 31-12-2026
        lease({
          leaseId: "b",
          tenantName: "Beta Foods LLP",
          endDate: "2027-03-31",
        }),
        // Ends 30-11-2026, 1 month notice → 31-10-2026 is the last day
        lease({
          leaseId: "c",
          tenantName: "Chai Point",
          endDate: "2026-11-30",
          noticePeriodMonths: 1,
        }),
        // Already renewed: not listed
        lease({ leaseId: "d", status: "renewed", endDate: "2026-12-31" }),
        // Ends after the window (window ends 22-10-2027)
        lease({ leaseId: "e", endDate: "2027-10-23" }),
      ],
      "2026-10-23",
    );
    const [list, byQuarter] = report.sections;
    expect(list!.rows.map((r) => [r.tenant, r.end, r.days, r.notice])).toEqual([
      ["Chai Point", "2026-11-30", 38, "2026-10-31"],
      ["Beta Foods LLP", "2027-03-31", 159, "2026-12-31"],
    ]);
    // Rent in the last month: after the 01-04-2026 increase, ₹1,12,264
    expect(list!.rows[0]!.rent).toBe(11_226_400);
    expect(byQuarter!.rows.map((r) => [r.quarter, r.leases])).toEqual([
      ["Q3 FY 2026-27 (Oct–Dec)", 1],
      ["Q4 FY 2026-27 (Jan–Mar)", 1],
    ]);
    expect(report.period).toBe("Leases ending 23-10-2026 to 22-10-2027");
  });

  it("marks a notice day that has already passed", () => {
    const report = expirySchedule(
      [lease({ endDate: "2026-12-31", noticePeriodMonths: 3 })],
      "2026-10-23",
    );
    // 01-01-2027 − 3 months − 1 day = 30-09-2026, before 23-10-2026
    expect(report.sections[0]!.rows[0]).toMatchObject({
      notice: "2026-09-30",
      noticePassed: "Passed",
    });
  });
});

describe("expirySchedule window", () => {
  it("runs to the day before the same date a year on", () => {
    // From 29-02-2028: + 12 months rolls forward to 01-03-2029, − 1 day =
    // 28-02-2029, so a lease ending that day is listed
    const report = expirySchedule(
      [lease({ startDate: "2025-04-01", endDate: "2029-02-28" })],
      "2028-02-29",
    );
    expect(report.sections[0]!.rows).toHaveLength(1);
    expect(report.period).toBe("Leases ending 29-02-2028 to 28-02-2029");
  });
});
