import { describe, expect, it } from "vitest";
import { expectedDemoInvoices } from "../expected";

const october = expectedDemoInvoices("2026-10-24", "2026-10");
const line = (tenant: string, type: string) =>
  october.get(tenant)!.lines.find((l) => l.chargeType === type);

describe("expectedDemoInvoices", () => {
  it("bills every one of the 45 demo leases in October 2026", () => {
    expect(october.size).toBe(45);
  });

  it("works out Kalinga Infotech's October invoice", () => {
    // Office G01: 1,400 + (1 × 613 mod 3,200) = 2,013 sq ft carpet;
    // chargeable 2,013 × 1.35 = 2,717.55 → 2,718 sq ft.
    // Rent from 1 Aug 2023 at ₹90: 2,718 × ₹90 = ₹2,44,620; +5% on 1 Aug
    // 2024 = ₹2,56,851; 2025: ₹2,69,693.55 → ₹2,69,694; 2026: ₹2,83,178.70
    // → ₹2,83,179 (each increase rounded to the rupee).
    expect(line("Kalinga Infotech Pvt Ltd", "rent")?.taxablePaise).toBe(
      28317900,
    );
    // CAM 2,718 × ₹18 = ₹48,924; parking 1 slot × ₹4,000.
    expect(line("Kalinga Infotech Pvt Ltd", "cam")?.taxablePaise).toBe(4892400);
    expect(line("Kalinga Infotech Pvt Ltd", "parking")?.taxablePaise).toBe(
      400000,
    );
    const k = october.get("Kalinga Infotech Pvt Ltd")!;
    // ₹3,36,103 taxable; CGST = SGST = 9% per line:
    // rent ₹25,486.11, CAM ₹4,403.16, parking ₹360 → ₹30,249.27 each;
    // ₹3,96,601.54 rounded to ₹3,96,602 (round-off ₹0.46).
    expect(k.totals).toMatchObject({
      taxable: 33610300,
      cgst: 3024927,
      sgst: 3024927,
      igst: 0,
      roundOff: 46,
      grandTotal: 39660200,
    });
    // TDS 10% of ₹3,36,103 = ₹33,610.30 → ₹33,610.
    expect(k.expectedTds.amount).toBe(3361000);
    expect(k.dueDate).toBe("2026-10-08");
  });

  it("bills only maintenance during Ekam Software's rent-free months", () => {
    // Office 603: 1,400 + (27 × 613 mod 3,200) = 1,951 sq ft carpet →
    // 2,633.85 → 2,634 sq ft chargeable. Rent-free Aug–Oct 2026, so
    // CAM only: 2,634 × ₹18 = ₹47,412 + 18% GST ₹8,534.16 = ₹55,946.16
    // → ₹55,946.
    const e = october.get("Ekam Software Pvt Ltd")!;
    expect(e.lines.map((l) => l.chargeType)).toEqual(["cam"]);
    expect(e.totals.grandTotal).toBe(5594600);
  });

  it("gives the arcade's invoices 10 days to pay, and none to proprietors' TDS", () => {
    const shop = october.get("Malnad Coffee House")!;
    expect(shop.dueDate).toBe("2026-10-11");
    expect(shop.expectedTds.amount).toBe(0);
  });

  it("bills a lease starting next month nothing this month", () => {
    expect(
      expectedDemoInvoices("2026-10-24", "2026-07").has(
        "Ekam Software Pvt Ltd",
      ),
    ).toBe(false);
  });
});
