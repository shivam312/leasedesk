import { describe, expect, it } from "vitest";
import type { Ledger, LedgerEntry } from "@/lib/billing/ledger";
import {
  ledgerForYear,
  settlementReport,
  settlementShare,
  parseFinancialYear,
  statementReport,
  statementYears,
} from "../statement";

const e = (
  date: string,
  debit: number,
  credit: number,
  balance: number,
): LedgerEntry => ({
  date,
  kind: debit ? "invoice" : "payment",
  sourceId: date,
  label: debit ? `Invoice ${date}` : `Payment ${date}`,
  debitPaise: debit,
  creditPaise: credit,
  balancePaise: balance,
});

// March 2026: billed ₹1,18,000; April: paid ₹1,18,000, billed ₹1,18,000;
// May: paid ₹50,000. Balance ₹68,000 owed.
const ledger: Ledger = {
  entries: [
    e("2026-03-01", 11_800_000, 0, 11_800_000),
    e("2026-04-01", 11_800_000, 0, 23_600_000),
    e("2026-04-05", 0, 11_800_000, 11_800_000),
    e("2026-05-10", 0, 5_000_000, 6_800_000),
  ],
  closingPaise: 6_800_000,
  totalDebitPaise: 23_600_000,
  totalCreditPaise: 16_800_000,
};

describe("ledgerForYear", () => {
  it("brings forward the balance before April, then that year's lines", () => {
    const y = ledgerForYear(ledger, "2026-27");
    expect(y.openingPaise).toBe(11_800_000);
    expect(y.entries.map((x) => x.date)).toEqual([
      "2026-04-01",
      "2026-04-05",
      "2026-05-10",
    ]);
    expect(y.closingPaise).toBe(6_800_000);
  });

  it("shows only the brought-forward balance for a year with nothing in it", () => {
    const y = ledgerForYear(ledger, "2027-28");
    expect(y).toMatchObject({
      openingPaise: 6_800_000,
      entries: [],
      closingPaise: 6_800_000,
    });
  });

  it("is everything with no year", () => {
    expect(ledgerForYear(ledger, null).entries).toHaveLength(4);
  });
});

describe("statementReport", () => {
  it("starts with the balance brought forward and totals the year", () => {
    const r = statementReport("Acme", ledgerForYear(ledger, "2026-27"));
    expect(r.period).toBe("01-04-2026 to 31-03-2027 (FY 2026-27)");
    const s = r.sections[0]!;
    expect(s.rows[0]).toMatchObject({
      what: "Balance brought forward",
      balance: 11_800_000,
    });
    // Billed ₹1,18,000, paid ₹1,18,000 + ₹50,000 = ₹1,68,000 in the year.
    expect(s.totals).toMatchObject({
      what: "Balance due",
      billed: 11_800_000,
      paid: 16_800_000,
      balance: 6_800_000,
    });
  });
});

describe("financial year choices", () => {
  it("reads only real financial year labels", () => {
    expect(parseFinancialYear("2026-27")).toBe("2026-27");
    expect(parseFinancialYear("2026-28")).toBeNull();
    expect(parseFinancialYear("all")).toBeNull();
    expect(statementYears("2026-10-24")).toEqual([
      "2026-27",
      "2025-26",
      "2024-25",
    ]);
  });
});

describe("settlementReport", () => {
  it("takes the dues after TDS from the deposit and refunds the rest", () => {
    // Held ₹3,00,000. One invoice ₹1,38,060 left, ₹11,700 TDS expected:
    // dues ₹1,26,360, refund ₹3,00,000 − ₹1,26,360 = ₹1,73,640.
    const { report, settlement } = settlementReport({
      tenantName: "Acme",
      property: "Unit 301, E2E Tower",
      asOf: "2026-11-30",
      heldPaise: 3_00_000_00,
      unpaid: [
        {
          number: "ET/26-27/0001",
          dueDate: "2026-11-08",
          outstandingPaise: 1_38_060_00,
          toPayPaise: 1_26_360_00,
        },
      ],
    });
    expect(settlement).toEqual({
      creditUsedPaise: 0,
      creditLeftPaise: 0,
      adjustPaise: 1_26_360_00,
      refundPaise: 1_73_640_00,
      stillOwedPaise: 0,
    });
    expect(report.sections[1]!.rows.map((r) => r.what)).toEqual([
      "Security deposit held",
      "Less: dues",
      "Deposit to refund",
    ]);
  });

  it("settles the dues from payment credit the tenant already holds before touching the deposit", () => {
    // Held ₹3,00,000. One invoice asks ₹1,26,360, and the tenant overpaid
    // earlier by ₹1,26,360 that isn't applied yet: the credit settles the
    // dues, so the whole ₹3,00,000 is refunded.
    const { report, settlement } = settlementReport({
      tenantName: "Acme",
      property: "Unit 301, E2E Tower",
      asOf: "2026-11-30",
      heldPaise: 3_00_000_00,
      creditPaise: 1_26_360_00,
      unpaid: [
        {
          number: "ET/26-27/0001",
          dueDate: "2026-11-08",
          outstandingPaise: 1_38_060_00,
          toPayPaise: 1_26_360_00,
        },
      ],
    });
    expect(settlement).toEqual({
      creditUsedPaise: 1_26_360_00,
      creditLeftPaise: 0,
      adjustPaise: 0,
      refundPaise: 3_00_000_00,
      stillOwedPaise: 0,
    });
    const rows = report.sections[1]!.rows;
    expect(rows.map((r) => [r.what, r.amount])).toEqual([
      ["Dues after TDS", 1_26_360_00],
      ["Less: credit from earlier payments, not yet applied", 1_26_360_00],
      ["Dues after credit", 0],
      ["Security deposit held", 3_00_000_00],
      ["Less: dues", 0],
      ["Deposit to refund", 3_00_000_00],
    ]);
    // Credit larger than the dues: the dues' worth settles them and the
    // rest is the tenant's money too. Held ₹1,00,000, dues ₹50,000, credit
    // ₹80,000: deposit refund ₹1,00,000, plus ₹30,000 of credit left over.
    const bigger = settlementReport({
      tenantName: "Acme",
      property: "Unit 301, E2E Tower",
      asOf: "2026-11-30",
      heldPaise: 1_00_000_00,
      creditPaise: 80_000_00,
      unpaid: [
        {
          number: "ET/26-27/0002",
          dueDate: "2026-11-08",
          outstandingPaise: 50_000_00,
          toPayPaise: 50_000_00,
        },
      ],
    });
    expect(bigger.settlement).toEqual({
      creditUsedPaise: 50_000_00,
      creditLeftPaise: 30_000_00,
      adjustPaise: 0,
      refundPaise: 1_00_000_00,
      stillOwedPaise: 0,
    });
    expect(bigger.report.sections[1]!.rows.at(-1)).toEqual({
      what: "Credit left over, also to pay back",
      amount: 30_000_00,
    });
    // One lease: the credit is simply the tenant's; with other leases, the
    // statement says it counts only this lease's share (settlementShare).
    expect((bigger.report.notes ?? []).join(" ")).toContain("Apply credit");
    expect((bigger.report.notes ?? []).join(" ")).not.toContain(
      "across all their leases",
    );
  });
});

describe("settlementShare", () => {
  // Tenant with two leases, L1 (ends first) and L2 (ends last), ₹50,000
  // opening balance as on 31-03-2026 and ₹1,60,000 of unapplied credit.
  // Dues after TDS, oldest first: opening ₹50,000 (31-03-2026), L1 ₹80,000
  // (08-10-2026), L2 ₹1,00,000 (08-10-2026, number after L1's), L1 ₹20,000
  // (08-11-2026). Credit ₹1,60,000 goes 50,000 → opening, 80,000 → L1,
  // 30,000 → L2 (of 1,00,000); nothing left over.
  const unpaid = [
    {
      leaseId: "L1",
      openingBalance: false,
      number: "A/0002",
      dueDate: "2026-10-08",
      toPayPaise: 8_000_000,
    },
    {
      leaseId: "L2",
      openingBalance: false,
      number: "A/0003",
      dueDate: "2026-10-08",
      toPayPaise: 10_000_000,
    },
    {
      leaseId: "L1",
      openingBalance: false,
      number: "A/0004",
      dueDate: "2026-11-08",
      toPayPaise: 2_000_000,
    },
    {
      leaseId: null,
      openingBalance: true,
      number: "Opening balance",
      dueDate: "2026-03-31",
      toPayPaise: 5_000_000,
    },
  ];
  const leases = [
    { id: "L1", endDate: "2027-03-31" },
    { id: "L2", endDate: "2029-03-31" },
  ];

  it("counts the credit once: each lease gets the share on its own dues, oldest first", () => {
    const l1 = settlementShare({
      leaseId: "L1",
      leases,
      unpaid,
      creditPaise: 16_000_000,
    });
    const l2 = settlementShare({
      leaseId: "L2",
      leases,
      unpaid,
      creditPaise: 16_000_000,
    });
    // L1: its two invoices, credit 80,000 (all on the October one).
    expect(l1.unpaid.map((u) => u.number)).toEqual(["A/0002", "A/0004"]);
    expect(l1.creditPaise).toBe(8_000_000);
    expect(l1.tenantWide).toBe(false);
    // L2 ends last: the opening balance too, and credit 50,000 + 30,000.
    expect(l2.unpaid.map((u) => u.number)).toEqual([
      "Opening balance",
      "A/0003",
    ]);
    expect(l2.creditPaise).toBe(8_000_000);
    expect(l2.tenantWide).toBe(true);
    // Together: exactly the ₹1,60,000 credit.
    expect(l1.creditPaise + l2.creditPaise).toBe(16_000_000);
  });

  it("puts credit beyond all the dues on the lease that ends last only", () => {
    // ₹3,00,000 credit against ₹2,50,000 of dues: ₹50,000 left over.
    const l1 = settlementShare({
      leaseId: "L1",
      leases,
      unpaid,
      creditPaise: 30_000_000,
    });
    const l2 = settlementShare({
      leaseId: "L2",
      leases,
      unpaid,
      creditPaise: 30_000_000,
    });
    expect(l1.creditPaise).toBe(10_000_000);
    // 50,000 opening + 1,00,000 L2 + 50,000 left over.
    expect(l2.creditPaise).toBe(20_000_000);
    expect(l1.creditPaise + l2.creditPaise).toBe(30_000_000);
  });

  it("a tenant with one lease gets everything on it", () => {
    const one = settlementShare({
      leaseId: "L1",
      leases: [{ id: "L1", endDate: "2027-03-31" }],
      unpaid: unpaid.filter((u) => u.leaseId !== "L2"),
      creditPaise: 1_000_000,
    });
    expect(one.unpaid).toHaveLength(3);
    expect(one.creditPaise).toBe(1_000_000);
  });
});
