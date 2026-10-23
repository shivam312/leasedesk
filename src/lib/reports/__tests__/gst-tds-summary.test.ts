import { describe, expect, it } from "vitest";
import type { TrackerRecord } from "@/lib/tds/tracker";
import { byRate, gstSummary, type GstDocument } from "../gst-summary";
import { tdsSummary } from "../tds-summary";

const OURS = "27AAACO1234A1Z5";

const invoice = (over: Partial<GstDocument>): GstDocument => ({
  kind: "invoice",
  supplierGstin: OURS,
  number: "OT/26-27/0001",
  date: "2026-10-01",
  recipientName: "Acme Software Pvt Ltd",
  recipientGstin: "27AABCA1234B1ZH",
  placeOfSupply: "27",
  // ₹1,00,000 rent + ₹9,000 + ₹9,000 = ₹1,18,000
  value: 11_800_000,
  lines: [
    {
      gstRateBp: 1800,
      taxable: 10_000_000,
      cgst: 900_000,
      sgst: 900_000,
      igst: 0,
    },
  ],
  ...over,
});

describe("byRate", () => {
  it("adds lines up per GST rate, lowest rate first", () => {
    expect(
      byRate([
        { gstRateBp: 1800, taxable: 100, cgst: 9, sgst: 9, igst: 0 },
        { gstRateBp: 0, taxable: 50, cgst: 0, sgst: 0, igst: 0 },
        { gstRateBp: 1800, taxable: 200, cgst: 18, sgst: 18, igst: 0 },
      ]),
    ).toEqual([
      { gstRateBp: 0, taxable: 50, cgst: 0, sgst: 0, igst: 0 },
      { gstRateBp: 1800, taxable: 300, cgst: 27, sgst: 27, igst: 0 },
    ]);
  });
});

describe("gstSummary [CA]", () => {
  it("nets credit notes against invoices by GSTIN and rate, and lists both", () => {
    const report = gstSummary(
      [
        invoice({}),
        // An unregistered tenant (B2C): ₹50,000 + ₹4,500 + ₹4,500
        invoice({
          number: "OT/26-27/0002",
          recipientName: "Chai Point",
          recipientGstin: null,
          value: 5_900_000,
          lines: [
            {
              gstRateBp: 1800,
              taxable: 5_000_000,
              cgst: 450_000,
              sgst: 450_000,
              igst: 0,
            },
          ],
        }),
        // ₹10,000 credited off a September invoice, issued in October
        {
          ...invoice({}),
          kind: "credit_note",
          number: "CN/26-27/0001",
          date: "2026-10-15",
          value: 1_180_000,
          invoiceNumber: "OT/26-27/0000",
          invoiceDate: "2026-09-01",
          lines: [
            {
              gstRateBp: 1800,
              taxable: 1_000_000,
              cgst: 90_000,
              sgst: 90_000,
              igst: 0,
            },
          ],
        },
      ],
      "2026-10",
    );
    const [summary, invoices, credits] = report.sections;
    // B2B: ₹1,00,000 − ₹10,000 = ₹90,000 taxable; CGST = SGST ₹9,000 − ₹900 = ₹8,100
    // B2C: ₹50,000 taxable; CGST = SGST ₹4,500
    expect(summary!.rows).toEqual([
      {
        gstin: OURS,
        type: "B2B",
        rate: 1800,
        invoiced: 10_000_000,
        credited: 1_000_000,
        taxable: 9_000_000,
        cgst: 810_000,
        sgst: 810_000,
        igst: 0,
        tax: 1_620_000,
      },
      {
        gstin: OURS,
        type: "B2C",
        rate: 1800,
        invoiced: 5_000_000,
        credited: 0,
        taxable: 5_000_000,
        cgst: 450_000,
        sgst: 450_000,
        igst: 0,
        tax: 900_000,
      },
    ]);
    // Altogether ₹1,40,000 taxable and ₹25,200 GST
    expect(summary!.totals).toMatchObject({
      taxable: 14_000_000,
      tax: 2_520_000,
    });
    expect(
      invoices!.rows.map((r) => [r.number, r.type, r.placeOfSupply]),
    ).toEqual([
      ["OT/26-27/0001", "B2B", "Maharashtra (27)"],
      ["OT/26-27/0002", "B2C", "Maharashtra (27)"],
    ]);
    expect(invoices!.totals).toMatchObject({
      taxable: 15_000_000,
      cgst: 1_350_000,
    });
    expect(credits!.rows[0]).toMatchObject({
      number: "CN/26-27/0001",
      invoiceNumber: "OT/26-27/0000",
      invoiceDate: "2026-09-01",
      taxable: 1_000_000,
    });
    expect(report.period).toBe("Oct 2026");
  });

  it("an invoice with two rates gives one row per rate", () => {
    const report = gstSummary(
      [
        invoice({
          lines: [
            {
              gstRateBp: 1800,
              taxable: 10_000_000,
              cgst: 900_000,
              sgst: 900_000,
              igst: 0,
            },
            { gstRateBp: 0, taxable: 200_000, cgst: 0, sgst: 0, igst: 0 },
          ],
        }),
      ],
      "2026-10",
    );
    expect(report.sections[1]!.rows.map((r) => r.rate)).toEqual([0, 1800]);
    expect(report.sections[0]!.rows).toHaveLength(2);
  });
});

describe("tdsSummary", () => {
  const rec = (over: Partial<TrackerRecord>): TrackerRecord => ({
    tenantId: "acme",
    tenantName: "Acme Software Pvt Ltd",
    financialYear: "2026-27",
    quarter: 2,
    amount: 1_000_000,
    certificateReceived: false,
    documentId: null,
    ...over,
  });

  it("lists each tenant's quarters with TDS, what's covered and what's overdue", () => {
    const report = tdsSummary(
      [
        rec({ quarter: 1, certificateReceived: true, documentId: "d" }),
        // Q2 certificate due 15-11-2026: not yet overdue on 23-10
        rec({ quarter: 2 }),
        rec({ quarter: 2, certificateReceived: true, documentId: "e" }),
      ],
      new Map([["acme", "AABCA1234B"]]),
      "2026-27",
      "2026-10-23",
    );
    const [sec] = report.sections;
    expect(sec!.rows).toEqual([
      {
        tenant: "Acme Software Pvt Ltd",
        pan: "AABCA1234B",
        quarter: "Q1 (Apr–Jun)",
        tds: 1_000_000,
        received: 1_000_000,
        pending: 0,
        due: "2026-08-15",
        status: "Received",
      },
      {
        tenant: "Acme Software Pvt Ltd",
        pan: "AABCA1234B",
        quarter: "Q2 (Jul–Sep)",
        tds: 2_000_000,
        received: 1_000_000,
        pending: 1_000_000,
        due: "2026-11-15",
        status: "Part received",
      },
    ]);
    expect(sec!.totals).toMatchObject({
      tds: 3_000_000,
      received: 2_000_000,
      pending: 1_000_000,
    });
  });
});
