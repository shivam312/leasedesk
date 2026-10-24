import { describe, expect, it } from "vitest";
import { activityLine, changedFields } from "../describe";

describe("activityLine", () => {
  it("says what was added, sent or reversed", () => {
    expect(
      activityLine({
        entityType: "tenants",
        action: "create",
        before: null,
        after: {},
      }),
    ).toBe("Tenant added");
    expect(
      activityLine({
        entityType: "invoices",
        action: "send",
        before: null,
        after: {},
      }),
    ).toBe("Invoice sent");
    expect(
      activityLine({
        entityType: "payments",
        action: "reverse",
        before: null,
        after: {},
      }),
    ).toBe("Payment reversed");
  });

  it("names the fields an edit changed, not the bookkeeping ones", () => {
    expect(
      activityLine({
        entityType: "tenants",
        action: "update",
        before: { companyName: "Acme", gstin: "27A", updatedAt: "1" },
        after: { companyName: "Acme Ltd", gstin: "27B", updatedAt: "2" },
      }),
    ).toBe("Tenant changed: company name, GSTIN");
    expect(changedFields({ a: [1] }, { a: [1] })).toEqual([]);
  });

  it("says who an email went to, or why it didn't", () => {
    expect(
      activityLine({
        entityType: "invoice_email",
        action: "send",
        before: null,
        after: { kind: "emailed", to: ["ap@acme.in"] },
      }),
    ).toBe("Invoice emailed to ap@acme.in");
    expect(
      activityLine({
        entityType: "invoice_email",
        action: "send",
        before: null,
        after: { kind: "no_email" },
      }),
    ).toBe("Invoice not emailed: no email address");
    expect(
      activityLine({
        entityType: "reminder_email",
        action: "send",
        before: null,
        after: { status: "failed", message: "Email isn't set up yet" },
      }),
    ).toBe("Reminder email failed: Email isn't set up yet");
  });
});
