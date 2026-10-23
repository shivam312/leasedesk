import { describe, expect, it } from "vitest";
import { tenantLedger, type LedgerSource } from "../ledger";

const nov: LedgerSource = {
  type: "invoice",
  id: "i1",
  date: "2026-11-01",
  number: "T/26-27/0001",
  totalPaise: 13_806_000,
};
const payNov: LedgerSource = {
  type: "payment",
  id: "p1",
  date: "2026-11-10",
  amountReceivedPaise: 12_636_000,
  tdsPaise: 1_170_000,
  mode: "NEFT",
  reference: "UTR123",
};
const dec: LedgerSource = {
  ...nov,
  id: "i2",
  date: "2026-12-01",
  number: "T/26-27/0002",
};
const cn: LedgerSource = {
  type: "credit_note",
  id: "c1",
  date: "2026-12-05",
  number: "TCN/26-27/0001",
  invoiceNumber: "T/26-27/0002",
  totalPaise: 1_180_000,
};
const big: LedgerSource = {
  type: "payment",
  id: "p2",
  date: "2026-12-06",
  amountReceivedPaise: 20_000_000,
  tdsPaise: 0,
  mode: "Cheque",
  reference: null,
};
const reversal: LedgerSource = {
  type: "reversal",
  id: "p3",
  date: "2026-12-07",
  amountReceivedPaise: -20_000_000,
  tdsPaise: 0,
  reference: null,
};

describe("tenantLedger", () => {
  it("keeps a running balance: invoices up, credit notes, payments and TDS down, reversals up", () => {
    const ledger = tenantLedger([reversal, big, cn, dec, payNov, nov]);
    expect(
      ledger.entries.map((e) => [
        e.date,
        e.label,
        e.debitPaise,
        e.creditPaise,
        e.balancePaise,
      ]),
    ).toEqual([
      // + ₹1,38,060 = ₹1,38,060 due
      ["2026-11-01", "Invoice T/26-27/0001", 13_806_000, 0, 13_806_000],
      // − ₹1,26,360 = ₹11,700
      [
        "2026-11-10",
        "Payment received (NEFT, ref UTR123)",
        0,
        12_636_000,
        1_170_000,
      ],
      // − ₹11,700 TDS = ₹0
      ["2026-11-10", "TDS kept back by the tenant", 0, 1_170_000, 0],
      // + ₹1,38,060 = ₹1,38,060
      ["2026-12-01", "Invoice T/26-27/0002", 13_806_000, 0, 13_806_000],
      // − ₹11,800 = ₹1,26,260
      [
        "2026-12-05",
        "Credit note TCN/26-27/0001 for invoice T/26-27/0002",
        0,
        1_180_000,
        12_626_000,
      ],
      // − ₹2,00,000 = −₹73,740 (in credit)
      ["2026-12-06", "Payment received (Cheque)", 0, 20_000_000, -7_374_000],
      // + ₹2,00,000 = ₹1,26,260
      ["2026-12-07", "Payment reversed", 20_000_000, 0, 12_626_000],
    ]);
    expect(ledger.closingPaise).toBe(12_626_000);
    // Debits ₹1,38,060 × 2 + ₹2,00,000 = ₹4,76,120; credits ₹4,76,120 − ₹1,26,260 = ₹3,49,860
    expect(ledger.totalDebitPaise).toBe(47_612_000);
    expect(ledger.totalCreditPaise).toBe(34_986_000);
  });

  it("on one day: invoices, then credit notes, then payments and reversals in the order made", () => {
    const sameDay = (s: LedgerSource): LedgerSource => ({
      ...s,
      date: "2026-12-01",
    });
    // Paid, reversed and paid again the same day, passed in the order made.
    const again: LedgerSource = {
      ...big,
      id: "p4",
      amountReceivedPaise: 12_626_000,
    };
    const ledger = tenantLedger([
      sameDay(big),
      sameDay(reversal),
      sameDay(again),
      sameDay(cn),
      dec,
    ]);
    expect(ledger.entries.map((e) => [e.sourceId, e.balancePaise])).toEqual([
      ["i2", 13_806_000],
      // − ₹11,800 = ₹1,26,260
      ["c1", 12_626_000],
      // − ₹2,00,000 = −₹73,740
      ["p2", -7_374_000],
      // reversed: ₹1,26,260 again
      ["p3", 12_626_000],
      // − ₹1,26,260 = ₹0
      ["p4", 0],
    ]);
  });

  it("puts each payment's TDS straight after it, with two payments on one day", () => {
    const second: LedgerSource = { ...payNov, id: "p9", reference: "UTR999" };
    const ledger = tenantLedger([nov, payNov, second]);
    expect(ledger.entries.map((e) => [e.sourceId, e.kind])).toEqual([
      ["i1", "invoice"],
      ["p1", "payment"],
      ["p1", "tds"],
      ["p9", "payment"],
      ["p9", "tds"],
    ]);
  });

  it("reverses the TDS of a reversed payment on its own line", () => {
    const ledger = tenantLedger([
      nov,
      payNov,
      {
        ...reversal,
        date: "2026-11-12",
        amountReceivedPaise: -12_636_000,
        tdsPaise: -1_170_000,
      },
    ]);
    expect(
      ledger.entries
        .slice(-2)
        .map((e) => [e.label, e.debitPaise, e.balancePaise]),
    ).toEqual([
      // ₹0 + ₹1,26,360 = ₹1,26,360
      ["Payment reversed", 12_636_000, 12_636_000],
      // + ₹11,700 = ₹1,38,060, the invoice again
      ["TDS kept back, reversed", 1_170_000, 13_806_000],
    ]);
  });

  it("is empty with a zero balance when there is nothing yet", () => {
    expect(tenantLedger([])).toEqual({
      entries: [],
      closingPaise: 0,
      totalDebitPaise: 0,
      totalCreditPaise: 0,
    });
  });

  it("refuses amounts that aren't whole paise", () => {
    expect(() =>
      tenantLedger([{ ...nov, totalPaise: 100.5 } as LedgerSource]),
    ).toThrow(/T\/26-27\/0001/);
  });

  it("refuses amounts with the wrong sign rather than guessing", () => {
    expect(() =>
      tenantLedger([{ ...big, amountReceivedPaise: -1 } as LedgerSource]),
    ).toThrow(/Payment p2/);
    expect(() =>
      tenantLedger([{ ...reversal, amountReceivedPaise: 1 } as LedgerSource]),
    ).toThrow(/Reversal p3/);
  });
});
