import { describe, expect, it } from "vitest";
import { addDays, compareDates } from "@/lib/billing/dates";
import { gstinProblem, isValidPan } from "@/lib/india/identifiers";
import {
  DEMO_BUILDINGS,
  DEMO_ENTITIES,
  DEMO_TENANTS,
  SPOTLIGHT,
  demoLeases,
  historyMonths,
  paymentDate,
} from "../plan";

const TODAY = "2026-10-24";
const leases = demoLeases(TODAY);
const lease = (name: string) => leases.find((l) => l.tenant === name)!;

describe("demo buildings", () => {
  it("has an 8-floor office block in Gurugram and a retail-front building in Bengaluru", () => {
    const [tower, arcade] = DEMO_BUILDINGS;
    expect(tower).toMatchObject({ city: "Gurugram", stateCode: "06" });
    expect(tower!.floors).toHaveLength(8);
    expect(arcade).toMatchObject({ city: "Bengaluru", stateCode: "29" });
    expect(arcade!.floors[0]!.units.every((u) => u.code.startsWith("G"))).toBe(
      true,
    );
  });

  it("bills from a GSTIN in each building's state", () => {
    expect(DEMO_ENTITIES.tower.gstin.slice(0, 2)).toBe("06");
    expect(DEMO_ENTITIES.arcade.gstin.slice(0, 2)).toBe("29");
    expect(gstinProblem(DEMO_ENTITIES.tower.gstin)).toBeNull();
    expect(gstinProblem(DEMO_ENTITIES.arcade.gstin)).toBeNull();
  });

  it("has a unit for every lease, and some left vacant", () => {
    for (const b of DEMO_BUILDINGS) {
      const units = b.floors.flatMap((f) => f.units);
      const used = leases.filter((l) => l.building === b.key);
      expect(new Set(used.map((l) => l.unitIndex)).size).toBe(used.length);
      expect(Math.max(...used.map((l) => l.unitIndex))).toBeLessThan(
        units.length,
      );
      expect(units.length).toBeGreaterThan(used.length);
    }
  });
});

describe("demo tenants", () => {
  it("has 45 tenants with distinct names", () => {
    expect(DEMO_TENANTS).toHaveLength(45);
    expect(new Set(DEMO_TENANTS.map((t) => t.name)).size).toBe(45);
  });

  it("gives valid PANs and GSTINs whose state code is the tenant's state", () => {
    for (const t of DEMO_TENANTS) {
      expect(isValidPan(t.pan), t.pan).toBe(true);
      if (!t.gstin) continue;
      expect(gstinProblem(t.gstin), t.gstin).toBeNull();
      expect(t.gstin.slice(0, 2)).toBe(t.stateCode);
      expect(t.gstin.slice(2, 12)).toBe(t.pan);
    }
    expect(DEMO_TENANTS.filter((t) => !t.gstin)).toHaveLength(1);
  });

  it("has proprietors who don't deduct TDS and companies who do", () => {
    expect(DEMO_TENANTS.filter((t) => !t.deductsTds).length).toBe(4);
    for (const name of [
      ...Object.keys(SPOTLIGHT.unpaid),
      ...SPOTLIGHT.missingCertificates,
    ])
      expect(DEMO_TENANTS.find((t) => t.name === name)?.deductsTds).toBe(true);
  });
});

describe("demo leases", () => {
  it("has one lease per tenant", () => {
    expect(leases).toHaveLength(45);
  });

  it("charges rents in realistic ranges", () => {
    for (const l of leases) {
      // Paise per sq ft a month: offices ₹75–₹125, shops ₹220–₹310.
      const [min, max] =
        l.areaBasis === "carpet" ? [22000, 31000] : [7500, 12500];
      expect(l.rentRate).toBeGreaterThanOrEqual(min);
      expect(l.rentRate).toBeLessThanOrEqual(max);
    }
  });

  it("mixes 5% a year and 15% every three years", () => {
    const kinds = new Set(
      leases.map(
        (l) => `${l.escalation.percentBp}/${l.escalation.everyMonths}`,
      ),
    );
    expect(kinds).toEqual(new Set(["500/12", "1500/36"]));
  });

  it("has two rent-free periods", () => {
    expect(
      new Set(leases.filter((l) => l.rentFreeMonths > 0).map((l) => l.tenant)),
    ).toEqual(new Set([SPOTLIGHT.rentFreeNow, SPOTLIGHT.rentFreePast]));
  });

  it("has exactly one lease ending in the next six months, in 60 days", () => {
    const soon = leases.filter(
      (l) => compareDates(l.endDate, addDays(TODAY, 183)) <= 0,
    );
    expect(soon.map((l) => l.tenant)).toEqual([SPOTLIGHT.expiringSoon]);
    expect(lease(SPOTLIGHT.expiringSoon).endDate).toBe("2026-12-23");
    for (const l of leases) expect(compareDates(l.startDate, TODAY)).toBe(-1);
  });

  it("has exactly one lease in lock-in", () => {
    const inLockIn = leases.filter(
      (l) => compareDates(l.lockInEndDate, TODAY) >= 0,
    );
    expect(inLockIn.map((l) => l.tenant)).toEqual([SPOTLIGHT.rentFreeNow]);
    // Started 1 Aug 2026 with three months rent-free: rent from 1 Nov.
    expect(lease(SPOTLIGHT.rentFreeNow)).toMatchObject({
      startDate: "2026-08-01",
      rentFreeMonths: 3,
    });
  });
});

describe("historyMonths", () => {
  it("goes back to June on 24 Oct 2026, so Q1's overdue certificates show", () => {
    // Q2 (Jul–Sep) certificates are due 15 Nov, Q1's were due 15 Aug.
    expect(historyMonths(TODAY)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("is the last three months when they already hold an overdue quarter", () => {
    // 1 Dec 2026: Q2's certificates were due 15 Nov; September is in it.
    expect(historyMonths("2026-12-01")).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("reaches back to last year's Q4 in early August", () => {
    // 10 Aug 2026: Q1 isn't due until 15 Aug; Q4 of 2025-26 was due 15 Jun.
    expect(historyMonths("2026-08-10")).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });
});

describe("paymentDate", () => {
  it("is a few days after the invoice, but never after today", () => {
    expect(paymentDate("2026-09-01", 0, TODAY)).toBe("2026-09-04");
    expect(paymentDate("2026-09-01", 2, TODAY)).toBe("2026-09-10");
    expect(paymentDate("2026-10-01", 2, "2026-10-05")).toBe("2026-10-05");
  });
});
