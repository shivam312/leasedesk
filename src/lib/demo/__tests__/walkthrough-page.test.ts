import { describe, expect, it } from "vitest";
import {
  CAPTIONS,
  caption,
  walkthroughPage,
  type WalkthroughFacts,
} from "../walkthrough-page";

// Kalinga's October 2026 invoice from a walkthrough run: rent ₹2,83,179,
// CAM 2,718 sq ft × ₹18 = ₹48,924, parking ₹4,000; ₹3,36,103 before GST,
// CGST = SGST = 9% = ₹30,249.27; ₹3,96,601.54 + ₹0.46 round-off = ₹3,96,602;
// TDS 10% of ₹3,36,103 = ₹33,610.30 → ₹33,610.
const facts: WalkthroughFacts = {
  today: "2026-10-24",
  month: "Oct 2026",
  email: "demo@sharma-estates.example",
  kalinga: {
    lease: {
      startDate: "2023-08-01",
      area: 271800,
      rentRate: 9000,
      percentBp: 500,
      everyMonths: 12,
    },
    invoice: {
      taxable: 33610300,
      cgst: 3024927,
      sgst: 3024927,
      roundOff: 46,
      grandTotal: 39660200,
      expectedTds: 3361000,
      dueDate: "2026-10-08",
      lines: [
        {
          type: "cam",
          description: "Maintenance (CAM) for Oct 2026",
          quantityLabel: null,
          taxable: 4892400,
        },
        {
          type: "parking",
          description: "Parking for Oct 2026",
          quantityLabel: null,
          taxable: 400000,
        },
        {
          type: "rent",
          description: "Rent for Oct 2026",
          quantityLabel: null,
          taxable: 28317900,
        },
      ],
    },
  },
  newLease: {
    unit: "703",
    area: 594400,
    ratePaise: 12500,
    startDate: "2026-11-01",
  },
  made: { count: 45, total: 2_70_00_000_00 },
  rangoli: {
    received: 90456200,
    tds: 8375600,
    numbers: ["SCT/26-27/0049", "SCT/26-27/0079"],
  },
  statement: {
    count: 3,
    received: 0,
    tenants: ["Gulmohar Interiors Pvt Ltd", "Mysore Silk Emporium Pvt Ltd"],
  },
};

// Every screenshot the walkthrough test takes (tests/e2e/walkthrough.spec.ts).
const SHOTS = [
  "log-in",
  "today",
  "phone-today",
  "phone-leases",
  "tenants",
  "tenant",
  "lease",
  "new-tenant",
  "new-lease-units",
  "new-lease-dates",
  "new-lease-charges",
  "new-lease-check",
  "new-lease-saved",
  "invoices-made",
  "draft",
  "explain",
  "send-check",
  "sent",
  "payment",
  "payment-recorded",
  "bank-import",
  "matches",
  "payments",
  "reports",
  "report-rent-roll",
  "report-vacancy",
  "report-expiry",
  "report-collections",
  "report-ageing",
  "report-gst-summary",
  "report-tds-summary",
  "report-tally",
];

describe("walkthrough captions", () => {
  it("has a caption for every screenshot", () => {
    for (const name of SHOTS) expect(CAPTIONS[name], name).toBeDefined();
  });

  it("explains the draft's numbers with the rules that made them", () => {
    const text = caption("draft", facts);
    expect(text).toContain("₹3,36,103 before GST");
    expect(text).toContain("CGST 9% + SGST 9% (₹30,249.27 each)");
    expect(text).toContain("round-off line of ₹0.46");
    expect(text).toContain("giving ₹3,96,602");
    expect(text).toContain("keep back ₹33,610 TDS");
    expect(text).toContain("<code>billing.roundInvoiceTotal</code>");
  });

  it("works out the lease's starting rent and the new lease's rent", () => {
    // 2,718 sq ft × ₹90 = ₹2,44,620; 5,944 sq ft × ₹125 = ₹7,43,000.
    expect(caption("lease", facts)).toContain(
      "₹90 per sq ft a month (₹2,44,620)",
    );
    expect(caption("lease", facts)).toContain("5% every 12 months");
    expect(caption("new-lease-check", facts)).toContain(
      "5,944 sq ft × ₹125 = ₹7,43,000",
    );
  });

  it("escapes names but keeps setting names as code", () => {
    const text = caption("payment", {
      ...facts,
      rangoli: { ...facts.rangoli, numbers: ["A<1>", "B&2"] },
    });
    expect(text).toContain("A&lt;1&gt; and B&amp;2");
    expect(caption("sent", facts)).toContain(
      "<code>invoice.numberFormat</code>",
    );
  });

  it("names the TDS quarter and financial year from the run's date, not from October 2026", () => {
    // Seeded on 24 Oct 2026: Q1's certificates were due 15 Aug, Q2's on 15 Nov.
    expect(caption("today", facts)).toContain("Q1's were due 15-08-2026");
    const tds = caption("report-tds-summary", facts);
    expect(tds).toContain("Q1's certificates were due on 15-08-2026");
    expect(tds).toContain("Q2's aren't due until 15-11-2026");
    expect(caption("sent", facts)).toContain("the financial year (26-27)");
    // Seeded on 20 Feb 2027: Q3's were due 15 Feb, Q4's on 15 Jun; still FY 26-27.
    const feb = { ...facts, today: "2027-02-20", month: "Feb 2027" };
    expect(caption("today", feb)).toContain("Q3's were due 15-02-2027");
    expect(caption("report-tds-summary", feb)).toContain(
      "Q4's aren't due until 15-06-2027",
    );
    expect(caption("sent", feb)).toContain("the financial year (26-27)");
    // Seeded on 1 May 2027: invoices are numbered in FY 27-28.
    expect(
      caption("sent", { ...facts, today: "2027-05-01", month: "May 2027" }),
    ).toContain("the financial year (27-28)");
  });

  it("counts the bank statement's lines from the run", () => {
    expect(caption("report-collections", facts)).toContain(
      "the three from the bank statement",
    );
    expect(
      caption("report-collections", {
        ...facts,
        statement: { ...facts.statement, count: 2 },
      }),
    ).toContain("the two from the bank statement");
  });

  it("falls back to the screen's name", () => {
    expect(caption("report-new-thing", facts)).toBe(
      "Screen: report new thing.",
    );
  });
});

describe("walkthroughPage", () => {
  const html = walkthroughPage({
    facts,
    shots: [
      {
        n: 1,
        file: "screens/01-log-in.png",
        step: "1",
        name: "log-in",
        width: 1280,
      },
      {
        n: 2,
        file: "screens/02-today.png",
        step: "1",
        name: "today",
        width: 1280,
      },
      {
        n: 3,
        file: "screens/03-phone-today.png",
        step: "phone",
        name: "phone-today",
        width: 375,
      },
    ],
  });

  it("puts the screenshots in order under their step", () => {
    expect(html.indexOf("1. Log in and read Today")).toBeLessThan(
      html.indexOf("screens/01-log-in.png"),
    );
    expect(html.indexOf("screens/02-today.png")).toBeLessThan(
      html.indexOf("on a phone (375px wide)"),
    );
    expect(html.match(/<section>/g)).toHaveLength(2);
  });

  it("shows phone screenshots narrow, and links the videos", () => {
    expect(html).toContain('<figure id="shot-3" class="phone">');
    expect(html).toContain('href="videos/laptop.webm"');
    expect(html).toContain('href="videos/phone.webm"');
    expect(html).toContain("Recorded on 24-10-2026");
  });
});
