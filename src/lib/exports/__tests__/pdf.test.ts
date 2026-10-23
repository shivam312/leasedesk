import { describe, expect, it } from "vitest";
import { collections } from "@/lib/reports/collections";
import { renderReportPdf } from "../pdf";

describe("renderReportPdf", () => {
  it("makes a PDF of a report with several sections, rows and an empty one", async () => {
    const report = collections(
      Array.from({ length: 60 }, (_, i) => ({
        kind: "payment" as const,
        receivedDate: "2026-10-05",
        tenantId: `t-${i}`,
        tenantName: `Tenant ${i} with a very long registered company name Private Limited`,
        mode: "neft",
        reference: `UTR${i}`,
        amountReceived: 10_620_000,
        tdsDeducted: 1_000_000,
        invoiceNumbers: ["OT/26-27/0007"],
      })),
      "2026-10-01",
      "2026-10-31",
    );
    const pdf = await renderReportPdf(report, "2026-10-23");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // 60 rows on landscape A4 run over more than one page per section
    const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(2);

    const empty = await renderReportPdf(
      collections([], "2026-10-01", "2026-10-31"),
      "2026-10-23",
    );
    expect(empty.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
