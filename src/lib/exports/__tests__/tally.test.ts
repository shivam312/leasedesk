import { describe, expect, it } from "vitest";
import {
  creditNoteVoucher,
  receiptVoucher,
  salesVoucher,
  tallyAmount,
  tallyVouchers,
  tallyXml,
  UnbalancedVoucherError,
  type TallyInvoice,
  type TallyLedgers,
} from "../tally";

const L: TallyLedgers = {
  rent: "Rent Income",
  maintenance: "Maintenance Income",
  otherIncome: "Other Income",
  cgst: "Output CGST",
  sgst: "Output SGST",
  igst: "Output IGST",
  tds: "TDS Receivable",
  roundOff: "Round Off",
  bank: "HDFC Current A/c",
};

// ₹1,00,000 rent + ₹10,000.50 maintenance = ₹1,10,000.50 taxable;
// GST 9% + 9% on each: rent ₹9,000 + ₹9,000; maintenance ₹900.05 + ₹900.05;
// total ₹1,29,800.60, rounded off −₹0.60 to ₹1,29,800
const invoice: TallyInvoice = {
  id: "inv-1",
  number: "OT/26-27/0007",
  date: "2026-10-01",
  party: "Acme Software Pvt Ltd",
  narration: "Rent and maintenance for Oct 2026",
  lines: [
    {
      chargeType: "rent",
      taxable: 10_000_000,
      cgst: 900_000,
      sgst: 900_000,
      igst: 0,
    },
    {
      chargeType: "cam",
      taxable: 1_000_050,
      cgst: 90_005,
      sgst: 90_005,
      igst: 0,
    },
  ],
  roundOff: -60,
  grandTotal: 12_980_000,
};

describe("salesVoucher", () => {
  it("debits the party the grand total and credits income, GST and round off", () => {
    const v = salesVoucher(invoice, L);
    expect(v.type).toBe("Sales");
    expect(v.entries).toEqual([
      {
        ledger: "Acme Software Pvt Ltd",
        amount: 12_980_000,
        bills: [{ name: "OT/26-27/0007", type: "New Ref", amount: 12_980_000 }],
      },
      { ledger: "Rent Income", amount: -10_000_000 },
      { ledger: "Maintenance Income", amount: -1_000_050 },
      // ₹9,000 + ₹900.05 = ₹9,900.05 each
      { ledger: "Output CGST", amount: -990_005 },
      { ledger: "Output SGST", amount: -990_005 },
      // A negative round off is a debit of ₹0.60
      { ledger: "Round Off", amount: 60 },
    ]);
  });

  it("refuses a voucher that doesn't balance", () => {
    expect(() =>
      salesVoucher({ ...invoice, grandTotal: 12_980_001 }, L),
    ).toThrow(UnbalancedVoucherError);
  });
});

describe("creditNoteVoucher", () => {
  it("is a sale the other way round, against the invoice", () => {
    // ₹10,000 rent credited: ₹900 + ₹900 GST, total ₹11,800
    const v = creditNoteVoucher(
      {
        id: "cn-1",
        number: "CN/26-27/0001",
        date: "2026-10-15",
        party: "Acme Software Pvt Ltd",
        invoiceNumber: "OT/26-27/0007",
        narration: "Waiver",
        lines: [
          {
            chargeType: "rent",
            taxable: 1_000_000,
            cgst: 90_000,
            sgst: 90_000,
            igst: 0,
          },
        ],
        roundOff: 0,
        total: 1_180_000,
      },
      L,
    );
    expect(v.entries).toEqual([
      {
        ledger: "Acme Software Pvt Ltd",
        amount: -1_180_000,
        bills: [
          { name: "OT/26-27/0007", type: "Agst Ref", amount: -1_180_000 },
        ],
      },
      { ledger: "Rent Income", amount: 1_000_000 },
      { ledger: "Output CGST", amount: 90_000 },
      { ledger: "Output SGST", amount: 90_000 },
    ]);
  });
});

describe("receiptVoucher", () => {
  it("bank and TDS debited, the party credited against each invoice, the rest on account", () => {
    // ₹1,20,000 received + ₹10,000 TDS = ₹1,30,000; ₹1,29,800 settles the
    // invoice, ₹200 stays on account
    const v = receiptVoucher(
      {
        id: "p-1",
        kind: "payment",
        date: "2026-10-05",
        party: "Acme Software Pvt Ltd",
        reference: "UTR123",
        narration: "NEFT",
        amountReceived: 12_000_000,
        tdsDeducted: 1_000_000,
        allocations: [{ invoiceNumber: "OT/26-27/0007", amount: 12_980_000 }],
      },
      L,
    );
    expect(v.type).toBe("Receipt");
    expect(v.entries).toEqual([
      { ledger: "HDFC Current A/c", amount: 12_000_000 },
      { ledger: "TDS Receivable", amount: 1_000_000 },
      {
        ledger: "Acme Software Pvt Ltd",
        amount: -13_000_000,
        bills: [
          { name: "OT/26-27/0007", type: "Agst Ref", amount: -12_980_000 },
          { name: "", type: "On Account", amount: -20_000 },
        ],
      },
    ]);
  });

  it("a reversal is a journal with every side swapped", () => {
    const v = receiptVoucher(
      {
        id: "r-1",
        kind: "reversal",
        date: "2026-10-20",
        party: "Acme Software Pvt Ltd",
        reference: null,
        narration: "Cheque bounced",
        amountReceived: -12_000_000,
        tdsDeducted: -1_000_000,
        allocations: [{ invoiceNumber: "OT/26-27/0007", amount: -12_980_000 }],
      },
      L,
    );
    expect(v.type).toBe("Journal");
    expect(v.entries.map((e) => e.amount)).toEqual([
      -12_000_000, -1_000_000, 13_000_000,
    ]);
    expect(v.entries[2]!.bills).toEqual([
      { name: "OT/26-27/0007", type: "Agst Ref", amount: 12_980_000 },
      { name: "", type: "On Account", amount: 20_000 },
    ]);
  });
});

describe("tallyXml", () => {
  it("writes amounts in rupees with Tally's signs, and escapes text", () => {
    expect(tallyAmount(12_980_000)).toBe("129800.00");
    expect(tallyAmount(-60)).toBe("-0.60");
    expect(tallyAmount(5)).toBe("0.05");
    const xml = tallyXml(
      tallyVouchers(
        {
          invoices: [{ ...invoice, party: "Acme & Sons <India>" }],
          creditNotes: [],
          payments: [],
        },
        L,
      ),
    );
    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain(
      '<VOUCHER REMOTEID="leasedesk-inv-1" VCHTYPE="Sales" ACTION="Create"><DATE>20261001</DATE>',
    );
    expect(xml).toContain("<VOUCHERNUMBER>OT/26-27/0007</VOUCHERNUMBER>");
    expect(xml).toContain(
      "<PARTYLEDGERNAME>Acme &amp; Sons &lt;India&gt;</PARTYLEDGERNAME>",
    );
    // The party is a debit: deemed positive, negative amount
    expect(xml).toContain(
      "<LEDGERNAME>Acme &amp; Sons &lt;India&gt;</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>-129800.00</AMOUNT>",
    );
    // Income is a credit: positive amount
    expect(xml).toContain(
      "<LEDGERNAME>Rent Income</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><ISPARTYLEDGER>No</ISPARTYLEDGER><AMOUNT>100000.00</AMOUNT>",
    );
    expect(xml).toContain(
      "<BILLALLOCATIONS.LIST><NAME>OT/26-27/0007</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-129800.00</AMOUNT></BILLALLOCATIONS.LIST>",
    );
  });

  it("orders vouchers by date, sales before receipts on a day", () => {
    const vs = tallyVouchers(
      {
        invoices: [invoice],
        creditNotes: [],
        payments: [
          {
            id: "p",
            kind: "payment",
            date: "2026-10-01",
            party: invoice.party,
            reference: null,
            narration: "",
            amountReceived: 100,
            tdsDeducted: 0,
            allocations: [],
          },
        ],
      },
      L,
    );
    expect(vs.map((v) => v.type)).toEqual(["Sales", "Receipt"]);
  });
});
