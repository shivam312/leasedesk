import { describe, expect, it } from "vitest";
import type { OpenInvoice } from "@/lib/billing/allocation";
import {
  guessMode,
  matchLine,
  nameIn,
  nameKey,
  numberIn,
  type MatchTenant,
} from "../matching";

const settings = { tdsTolerancePaise: 100 };

// ₹1,17,000 rent + 18% GST = ₹1,38,060; TDS 10% = ₹11,700; net ₹1,26,360
const inv = (
  id: string,
  number: string,
  dueDate: string,
  over: Partial<OpenInvoice> = {},
): OpenInvoice => ({
  id,
  number,
  dueDate,
  outstandingPaise: 13_806_000,
  expectedTdsPaise: 1_170_000,
  ...over,
});

const acme: MatchTenant = {
  id: "acme",
  name: "Acme Software Pvt Ltd",
  invoices: [
    inv("a-oct", "T/26-27/0001", "2026-10-08"),
    inv("a-nov", "T/26-27/0004", "2026-11-08"),
  ],
};
const globex: MatchTenant = {
  id: "globex",
  name: "Globex Foods LLP",
  invoices: [
    inv("g-nov", "T/26-27/0005", "2026-11-08", {
      outstandingPaise: 5_900_000,
      expectedTdsPaise: 500_000,
    }),
  ],
};
const initech: MatchTenant = {
  id: "initech",
  name: "Initech",
  invoices: [inv("i-nov", "T/26-27/0006", "2026-11-08")],
};
const tenants = [acme, globex, initech];

const line = (description: string, creditPaise: number, reference = "") => ({
  description,
  reference,
  creditPaise,
});

describe("nameKey", () => {
  it("drops company words and punctuation", () => {
    expect(nameKey("Acme Software Pvt. Ltd.")).toBe("acmesoftware");
    expect(nameKey("M/s Globex Foods LLP")).toBe("globexfoods");
    expect(nameKey("The Bharat & Sons Private Limited")).toBe("bharatandsons");
  });
});

describe("nameIn", () => {
  it.each([
    ["NEFT CR-HDFC0000001-ACME SOFTWARE PVT LTD", "Acme Software Pvt Ltd"],
    ["UPI/ACME SOFTWA/REF", "Acme Software Pvt Ltd"],
    ["IMPS ACMESOFTWARE 123", "Acme Software Pvt Ltd"],
    ["RTGS INITECH LLP", "Initech"],
  ])("finds the name in %j", (text, name) => {
    expect(nameIn(text, name)).toBe(true);
  });

  it.each([
    ["NEFT INNOVATIVE SYSTEMS", "Nova Traders"],
    ["UPI PRAKASHASHAH", "Asha Foods"],
    ["NEFT ACME CORP", "Acme Software Pvt Ltd"],
    ["NEFT AB", "AB"],
  ])("doesn't find a name inside other words: %j", (text, name) => {
    expect(nameIn(text, name)).toBe(false);
  });
});

describe("numberIn", () => {
  it.each([
    ["INV T/26-27/0001 NOV RENT", true],
    ["INVT/26-27/0001", true],
    ["IMPS 6308 T26270001", true],
    ["REF AT/26-27/0001", false],
    ["T/26-27/00012", false],
    ["T2627000123", false],
  ])("%j → %s", (text, found) => {
    expect(numberIn(text, "T/26-27/0001")).toBe(found);
  });
});

describe("matchLine", () => {
  it("names the tenant and the invoice when amount less TDS and name agree", () => {
    // 1,26,360 = Acme's October invoice ₹1,38,060 − ₹11,700 TDS
    expect(
      matchLine({
        line: line("NEFT CR-HDFC0000001-ACME SOFTWARE PVT LTD", 12_636_000),
        tenants,
        settings,
      }),
    ).toEqual({
      tenantId: "acme",
      invoiceIds: ["a-oct"],
      tdsPaise: 1_170_000,
      confidence: 90,
      reasons: [
        "Acme Software Pvt Ltd's name is in the description",
        "₹1,26,360 is invoice T/26-27/0001 less ₹11,700 TDS",
      ],
    });
  });

  it("uses an invoice number in the reference to pick the invoice", () => {
    // The November invoice named, even though October is older
    const m = matchLine({
      line: line("NEFT INWARD", 12_636_000, "INV T/26-27/0004"),
      tenants,
      settings,
    });
    expect(m).toMatchObject({
      tenantId: "acme",
      invoiceIds: ["a-nov"],
      tdsPaise: 1_170_000,
    });
    expect(m!.confidence).toBeGreaterThanOrEqual(90);
    expect(m!.reasons).toContain("Invoice T/26-27/0004 is in the reference");
  });

  it("finds an invoice number even with its slashes dropped", () => {
    expect(
      matchLine({
        line: line("IMPS 630812345678 T26270005", 5_400_000),
        tenants,
        settings,
      }),
    ).toMatchObject({ tenantId: "globex", invoiceIds: ["g-nov"] });
  });

  it("is a medium match on the full amount with the name, no TDS", () => {
    // 59,000 = Globex's invoice in full
    expect(
      matchLine({
        line: line("IMPS/P2A/630812345678/GLOBEX FOODS", 5_900_000),
        tenants,
        settings,
      }),
    ).toMatchObject({
      tenantId: "globex",
      invoiceIds: ["g-nov"],
      tdsPaise: 0,
      confidence: 75,
    });
  });

  it("covers several invoices of one tenant, oldest first", () => {
    // 2 × 1,26,360 = 2,52,720 = both Acme invoices less 2 × ₹11,700
    expect(
      matchLine({
        line: line("RTGS ACME SOFTWARE", 25_272_000),
        tenants,
        settings,
      }),
    ).toMatchObject({
      tenantId: "acme",
      invoiceIds: ["a-oct", "a-nov"],
      tdsPaise: 2_340_000,
    });
  });

  it("an amount alone is only a possible match, and not when two tenants fit", () => {
    // Initech and Acme both owe ₹1,26,360 net; no name → no suggestion
    expect(
      matchLine({
        line: line("NEFT INWARD 123", 12_636_000),
        tenants,
        settings,
      }),
    ).toBeNull();
    // Only Globex owes ₹54,000 net → possible match
    expect(
      matchLine({
        line: line("NEFT INWARD 123", 5_400_000),
        tenants,
        settings,
      }),
    ).toMatchObject({ tenantId: "globex", confidence: 50 });
  });

  it("a name alone suggests the tenant, part payment oldest first, no TDS", () => {
    expect(
      matchLine({
        line: line("UPI/ACME SOFTWARE/REF", 1_000_000),
        tenants,
        settings,
      }),
    ).toEqual({
      tenantId: "acme",
      invoiceIds: ["a-oct"],
      tdsPaise: 0,
      confidence: 40,
      reasons: ["Acme Software Pvt Ltd's name is in the description"],
    });
  });

  it("can be limited to one tenant (confirming with a tenant chosen)", () => {
    expect(
      matchLine({
        line: line("NEFT INWARD 123", 12_636_000),
        tenants: [initech],
        settings,
      }),
    ).toMatchObject({ tenantId: "initech", tdsPaise: 1_170_000 });
  });

  it("doesn't skip older unpaid invoices for an unnamed newer one", () => {
    // ₹1,26,360 could be Acme's November invoice less TDS, but October is
    // older and unpaid: amount alone matches October (oldest first)
    const m = matchLine({
      line: line("NEFT ACME SOFTWARE", 12_636_000),
      tenants: [acme],
      settings,
    });
    expect(m?.invoiceIds).toEqual(["a-oct"]);
  });

  it("is null for money that matches nobody", () => {
    expect(
      matchLine({ line: line("INTEREST CREDIT", 12_345), tenants, settings }),
    ).toBeNull();
  });
});

describe("guessMode", () => {
  it.each([
    ["NEFT CR-HDFC0000001-ACME", "neft"],
    ["RTGS-UTIB0000003-INITECH", "rtgs"],
    ["IMPS/P2A/630812345678", "imps"],
    ["UPI/BHARAT TRADERS", "upi"],
    ["CHQ DEP 000123", "cheque"],
    ["CLG/000456/HDFC", "cheque"],
    ["CASH DEPOSIT", "cash"],
    ["BY TRANSFER", "other"],
  ])("%s → %s", (text, mode) => {
    expect(guessMode(text)).toBe(mode);
  });
});
