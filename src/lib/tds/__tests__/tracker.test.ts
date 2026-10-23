import { describe, expect, it } from "vitest";
import {
  certificateDue,
  financialYearChoices,
  tdsTracker,
  type TrackerRecord,
} from "../tracker";

const rec = (over: Partial<TrackerRecord>): TrackerRecord => ({
  tenantId: "acme",
  tenantName: "Acme Software Pvt Ltd",
  financialYear: "2026-27",
  quarter: 3,
  amount: 1_170_000,
  certificateReceived: false,
  documentId: null,
  ...over,
});

describe("certificateDue [CA]", () => {
  it("is 15 days after each quarter's TDS return", () => {
    expect(certificateDue("2026-27", 1)).toBe("2026-08-15");
    expect(certificateDue("2026-27", 2)).toBe("2026-11-15");
    expect(certificateDue("2026-27", 3)).toBe("2027-02-15");
    expect(certificateDue("2026-27", 4)).toBe("2027-06-15");
  });
});

describe("tdsTracker", () => {
  it("adds TDS by tenant and quarter, and says what's missing", () => {
    const t = tdsTracker({
      financialYear: "2026-27",
      today: "2027-03-01",
      records: [
        // Q2: ₹11,700 + ₹11,700, certificate received
        rec({ quarter: 2, certificateReceived: true, documentId: "d1" }),
        rec({ quarter: 2, certificateReceived: true, documentId: "d1" }),
        // Q3: ₹11,700 received, ₹11,700 not → part
        rec({ quarter: 3, certificateReceived: true, documentId: "d2" }),
        rec({ quarter: 3 }),
        // Globex Q3: pending, past 15 Feb 2027 → overdue
        rec({
          tenantId: "globex",
          tenantName: "Globex Foods LLP",
          amount: 500_000,
        }),
        // Another year is left out
        rec({ financialYear: "2025-26", quarter: 4 }),
      ],
    });
    expect(t.rows).toEqual([
      {
        tenantId: "acme",
        tenantName: "Acme Software Pvt Ltd",
        total: 4_680_000,
        missing: 1_170_000,
        quarters: [
          {
            quarter: 1,
            amount: 0,
            received: 0,
            status: "none",
            due: "2026-08-15",
            overdue: false,
            documentIds: [],
          },
          {
            quarter: 2,
            amount: 2_340_000,
            received: 2_340_000,
            status: "received",
            due: "2026-11-15",
            overdue: false,
            documentIds: ["d1"],
          },
          {
            quarter: 3,
            amount: 2_340_000,
            received: 1_170_000,
            status: "part",
            due: "2027-02-15",
            overdue: true,
            documentIds: ["d2"],
          },
          {
            quarter: 4,
            amount: 0,
            received: 0,
            status: "none",
            due: "2027-06-15",
            overdue: false,
            documentIds: [],
          },
        ],
      },
      expect.objectContaining({
        tenantId: "globex",
        total: 500_000,
        missing: 500_000,
        quarters: expect.arrayContaining([
          expect.objectContaining({
            quarter: 3,
            status: "pending",
            overdue: true,
          }),
        ]),
      }),
    ]);
    expect(t.totals).toEqual({
      total: 5_180_000,
      missing: 1_670_000,
      overdueCount: 2,
    });
  });

  it("isn't overdue before the due date", () => {
    const t = tdsTracker({
      financialYear: "2026-27",
      today: "2027-02-15",
      records: [rec({})],
    });
    expect(t.rows[0]!.quarters[2]).toMatchObject({
      status: "pending",
      overdue: false,
    });
  });

  it("is empty with no TDS", () => {
    expect(
      tdsTracker({
        financialYear: "2026-27",
        today: "2027-01-01",
        records: [],
      }),
    ).toEqual({ rows: [], totals: { total: 0, missing: 0, overdueCount: 0 } });
  });
});

describe("financialYearChoices", () => {
  it("offers this year and the two before, newest first", () => {
    expect(financialYearChoices("2026-10-23")).toEqual([
      "2026-27",
      "2025-26",
      "2024-25",
    ]);
    expect(financialYearChoices("2027-02-01")[0]).toBe("2026-27");
  });
});
