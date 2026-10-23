import { describe, expect, it } from "vitest";
import { invoiceDocument } from "@/lib/invoices/document";
import { source } from "@/lib/invoices/__tests__/fixtures";
import { reminderEmail, reminderStepWords } from "../email";

// ₹1,18,000 invoice B1/26-27/0001, due 08-11-2026, ₹10,000 TDS expected.
const doc = invoiceDocument(source());

describe("reminderEmail", () => {
  it("before the due date: amount, due date and how to pay", () => {
    const email = reminderEmail(doc, {
      to: ["accounts@acme.in"],
      kind: "before",
      today: "2026-11-05",
      dueDate: "2026-11-08",
      // ₹1,18,000 − ₹10,000 TDS = ₹1,08,000
      amountPaise: 10_800_000,
    });
    expect(email.to).toEqual(["accounts@acme.in"]);
    expect(email.subject).toBe(
      "Reminder: invoice B1/26-27/0001 for ₹1,08,000 is due on 08-11-2026",
    );
    expect(email.text).toContain("Dear Acme Tech Pvt Ltd,");
    expect(email.text).toContain(
      "This is a reminder that invoice B1/26-27/0001 dated 01-11-2026",
    );
    expect(email.text).toContain("Amount to pay: ₹1,08,000");
    expect(email.text).toContain("Due by: 08-11-2026");
    expect(email.text).toContain("IFSC: HDFC0000123");
    expect(email.text).toContain("Please quote B1/26-27/0001");
    expect(email.text).toContain("Regards,\nDemo Properties LLP");
    expect(email.attachments).toBeUndefined();
  });

  it("on the due date says it is due today", () => {
    const email = reminderEmail(doc, {
      to: ["a@acme.in"],
      kind: "before",
      today: "2026-11-08",
      dueDate: "2026-11-08",
      amountPaise: 10_800_000,
    });
    expect(email.subject).toBe(
      "Reminder: invoice B1/26-27/0001 for ₹1,08,000 is due today",
    );
  });

  it("after the due date: how many days overdue", () => {
    // Due 08-11, today 15-11: 7 days overdue.
    const email = reminderEmail(doc, {
      to: ["a@acme.in"],
      kind: "after",
      today: "2026-11-15",
      dueDate: "2026-11-08",
      amountPaise: 5_000_000,
    });
    expect(email.subject).toBe(
      "Overdue: invoice B1/26-27/0001, ₹50,000 was due on 08-11-2026",
    );
    expect(email.text).toContain("is 7 days overdue");
    expect(email.text).toContain("Amount to pay: ₹50,000");
    expect(email.text).toContain(
      "If you have already paid, please reply with the payment details",
    );
  });

  it("says 1 day, not 1 days", () => {
    const email = reminderEmail(doc, {
      to: ["a@acme.in"],
      kind: "after",
      today: "2026-11-09",
      dueDate: "2026-11-08",
      amountPaise: 5_000_000,
    });
    expect(email.text).toContain("is 1 day overdue");
  });
});

describe("reminderStepWords", () => {
  it("says when in the schedule a reminder went", () => {
    expect(reminderStepWords("before:3")).toBe("3 days before the due date");
    expect(reminderStepWords("before:0")).toBe("On the due date");
    expect(reminderStepWords("after:1")).toBe("1 day after the due date");
    expect(reminderStepWords("after:15")).toBe("15 days after the due date");
    expect(reminderStepWords(null)).toBe("Sent by hand");
  });
});
