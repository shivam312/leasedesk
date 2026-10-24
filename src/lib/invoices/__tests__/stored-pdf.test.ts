import { describe, expect, it } from "vitest";
import { storedPdfIsCurrent } from "../stored-pdf";

describe("storedPdfIsCurrent", () => {
  it("serves the send-time file only while the invoice still asks for the same payment", () => {
    // The file printed at send time says "To pay ₹1,26,360" with a UPI QR
    // for it. That stays right while the invoice is sent (or overdue) and
    // nothing has been credited.
    expect(storedPdfIsCurrent("sent", 0)).toBe(true);
    expect(storedPdfIsCurrent("overdue", 0)).toBe(true);
    // Paid, part-paid or cancelled: the PDF must print the PAID or CANCELLED
    // notice and no QR, so it's rendered from the frozen copies again.
    expect(storedPdfIsCurrent("part_paid", 0)).toBe(false);
    expect(storedPdfIsCurrent("paid", 0)).toBe(false);
    expect(storedPdfIsCurrent("cancelled", 0)).toBe(false);
    expect(storedPdfIsCurrent("draft", 0)).toBe(false);
    // A credit note changes what's left to pay (D-017): rendered again.
    expect(storedPdfIsCurrent("sent", 11_800_00)).toBe(false);
  });
});
