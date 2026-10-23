import { describe, expect, it } from "vitest";
import {
  ageing,
  ageingBucket,
  collections,
  daysOverdue,
  type AgeingInvoice,
  type CollectionPayment,
} from "../collections";
import { reportParams, searchReport } from "../registry";

const pay = (over: Partial<CollectionPayment>): CollectionPayment => ({
  kind: "payment",
  receivedDate: "2026-10-05",
  tenantId: "t-acme",
  tenantName: "Acme Software Pvt Ltd",
  mode: "neft",
  reference: "UTR123",
  amountReceived: 10_620_000,
  tdsDeducted: 1_000_000,
  invoiceNumbers: ["OT/26-27/0007"],
  ...over,
});

describe("collections", () => {
  it("lists payments in the dates, nets reversals, and totals by tenant", () => {
    const report = collections(
      [
        pay({}),
        // Outside the dates
        pay({ receivedDate: "2026-09-30" }),
        pay({
          tenantId: "t-beta",
          tenantName: "Beta Foods LLP",
          amountReceived: 5_000_000,
          tdsDeducted: 0,
          mode: "upi",
        }),
        // Reversal of the first payment on 20-10
        pay({
          kind: "reversal",
          receivedDate: "2026-10-20",
          amountReceived: -10_620_000,
          tdsDeducted: -1_000_000,
        }),
      ],
      "2026-10-01",
      "2026-10-31",
    );
    const [list, byTenant] = report.sections;
    expect(list!.rows.map((r) => r.reference)).toEqual([
      "UTR123",
      "UTR123",
      "Reversal",
    ]);
    expect(list!.rows[0]).toMatchObject({ mode: "NEFT", settled: 11_620_000 });
    // ₹1,06,200 + ₹50,000 − ₹1,06,200 = ₹50,000 received; TDS ₹10,000 − ₹10,000 = 0
    expect(list!.totals).toMatchObject({
      received: 5_000_000,
      tds: 0,
      settled: 5_000_000,
    });
    expect(byTenant!.rows).toEqual([
      { tenant: "Acme Software Pvt Ltd", received: 0, tds: 0, settled: 0 },
      {
        tenant: "Beta Foods LLP",
        received: 5_000_000,
        tds: 0,
        settled: 5_000_000,
      },
    ]);
    expect(report.period).toBe("01-10-2026 to 31-10-2026");
  });

  it("keeps two tenants with the same name in separate rows", () => {
    const report = collections(
      [
        pay({}),
        pay({
          tenantId: "t-acme-2",
          amountReceived: 5_000_000,
          tdsDeducted: 0,
        }),
      ],
      "2026-10-01",
      "2026-10-31",
    );
    const byTenant = report.sections[1]!;
    expect(byTenant.rows.map((r) => r.settled)).toEqual([
      11_620_000, 5_000_000,
    ]);
    expect(byTenant.rows.map((r) => r.tenant)).toEqual([
      "Acme Software Pvt Ltd",
      "Acme Software Pvt Ltd",
    ]);
  });

  it("says so when nothing was received", () => {
    const report = collections([], "2026-10-01", "2026-10-31");
    expect(report.sections[0]!.rows).toEqual([]);
    expect(report.sections[0]!.totals).toBeUndefined();
  });
});

describe("ageing", () => {
  it("counts days from the due date into 30-day buckets", () => {
    expect(daysOverdue("2026-10-07", "2026-10-07")).toBe(0);
    expect(daysOverdue("2026-10-07", "2026-11-06")).toBe(30);
    expect(ageingBucket(0)).toBe("notDue");
    expect(ageingBucket(-3)).toBe("notDue");
    expect(ageingBucket(1)).toBe("d30");
    expect(ageingBucket(30)).toBe("d30");
    expect(ageingBucket(31)).toBe("d60");
    expect(ageingBucket(60)).toBe("d60");
    expect(ageingBucket(61)).toBe("d90");
    expect(ageingBucket(90)).toBe("d90");
    expect(ageingBucket(91)).toBe("over90");
  });

  const inv = (over: Partial<AgeingInvoice>): AgeingInvoice => ({
    tenantId: "t-acme",
    tenantName: "Acme Software Pvt Ltd",
    number: "OT/26-27/0001",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-08",
    outstandingPaise: 11_800_000,
    expectedTdsPaise: 1_000_000,
    ...over,
  });

  it("buckets each tenant's unpaid invoices and totals them", () => {
    const report = ageing(
      [
        // Due 08-10, 15 days overdue on 23-10 → 1–30
        inv({}),
        // Due 08-07: 107 days → over 90
        inv({
          number: "OT/26-27/0002",
          dueDate: "2026-07-08",
          outstandingPaise: 500_000,
        }),
        // Not due until 30-10
        inv({
          tenantId: "t-beta",
          tenantName: "Beta Foods LLP",
          dueDate: "2026-10-30",
          outstandingPaise: 2_000_000,
        }),
        // Settled: left out
        inv({ number: "X", outstandingPaise: 0 }),
      ],
      "2026-10-23",
    );
    const [byTenant, detail] = report.sections;
    expect(byTenant!.rows).toEqual([
      {
        tenant: "Acme Software Pvt Ltd",
        notDue: 0,
        d30: 11_800_000,
        d60: 0,
        d90: 0,
        over90: 500_000,
        total: 12_300_000,
      },
      {
        tenant: "Beta Foods LLP",
        notDue: 2_000_000,
        d30: 0,
        d60: 0,
        d90: 0,
        over90: 0,
        total: 2_000_000,
      },
    ]);
    expect(byTenant!.totals).toMatchObject({
      notDue: 2_000_000,
      d30: 11_800_000,
      over90: 500_000,
      total: 14_300_000,
    });
    expect(detail!.rows.map((r) => [r.number, r.days])).toEqual([
      ["OT/26-27/0002", 107],
      ["OT/26-27/0001", 15],
      ["OT/26-27/0001", 0],
    ]);
  });

  it("keeps two tenants with the same name in separate rows", () => {
    const report = ageing(
      [
        inv({}),
        inv({
          tenantId: "t-acme-2",
          number: "OT/26-27/0003",
          outstandingPaise: 500_000,
        }),
      ],
      "2026-10-23",
    );
    const byTenant = report.sections[0]!;
    expect(byTenant.rows.map((r) => [r.tenant, r.total])).toEqual([
      ["Acme Software Pvt Ltd", 11_800_000],
      ["Acme Software Pvt Ltd", 500_000],
    ]);
    expect(byTenant.totals).toMatchObject({ total: 12_300_000 });
  });
});

describe("reportParams", () => {
  it("defaults to today and this month so far", () => {
    expect(reportParams({}, "2026-10-23")).toEqual({
      today: "2026-10-23",
      month: "2026-10",
      financialYear: "2026-27",
      asOf: "2026-10-23",
      from: "2026-10-01",
      to: "2026-10-23",
    });
  });

  it("ignores dates that aren't real or are far off, and swaps a backwards range", () => {
    expect(
      reportParams(
        { asOf: "2026-02-30", from: "2026-10-31", to: "2026-10-01" },
        "2026-10-23",
      ),
    ).toMatchObject({
      asOf: "2026-10-23",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(reportParams({ asOf: "1990-01-01" }, "2026-10-23").asOf).toBe(
      "2026-10-23",
    );
  });
});

describe("searchReport", () => {
  it("keeps matching rows and drops totals", () => {
    const report = collections(
      [pay({}), pay({ tenantId: "t-beta", tenantName: "Beta Foods LLP" })],
      "2026-10-01",
      "2026-10-31",
    );
    const found = searchReport(report, "beta");
    expect(found.sections[0]!.rows).toHaveLength(1);
    expect(found.sections[0]!.totals).toBeUndefined();
    expect(found.sections[0]!.empty).toBe('Nothing matches "beta".');
  });
});
