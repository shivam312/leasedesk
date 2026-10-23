import { describe, expect, it } from "vitest";
import { invoiceDocument } from "@/lib/invoices/document";
import { source } from "@/lib/invoices/__tests__/fixtures";
import { whatsappLink, whatsappRecipient, whatsappText } from "../whatsapp";

// ₹1,18,000 invoice B1/26-27/0001, due 08-11-2026, ₹10,000 TDS expected.
const doc = invoiceDocument(source());

const contact = (
  over: Partial<{
    name: string;
    phone: string | null;
    whatsapp: boolean;
    role: "billing" | "admin" | "legal" | "other";
    isPrimary: boolean;
  }>,
) => ({
  name: "Ravi",
  phone: "+919820012345",
  whatsapp: true,
  role: "other" as const,
  isPrimary: false,
  ...over,
});

describe("whatsappRecipient", () => {
  it("prefers an accounts contact on WhatsApp, then the primary, then anyone", () => {
    expect(
      whatsappRecipient([
        contact({ name: "Primary", isPrimary: true, phone: "+919800000001" }),
        contact({ name: "Accounts", role: "billing", phone: "+919800000002" }),
      ]),
    ).toEqual({ name: "Accounts", phone: "+919800000002" });
    expect(
      whatsappRecipient([
        contact({ name: "Other", phone: "+919800000003" }),
        contact({ name: "Primary", isPrimary: true, phone: "+919800000001" }),
      ]),
    ).toEqual({ name: "Primary", phone: "+919800000001" });
    expect(whatsappRecipient([contact({ name: "Other" })])).toEqual({
      name: "Other",
      phone: "+919820012345",
    });
  });

  it("is nobody when no contact has WhatsApp on a phone number", () => {
    expect(
      whatsappRecipient([
        contact({ whatsapp: false }),
        contact({ phone: null }),
      ]),
    ).toBeNull();
  });
});

describe("whatsappText", () => {
  it("before the due date: amount, due date, invoice number and how to pay", () => {
    const text = whatsappText(doc, {
      today: "2026-11-05",
      dueDate: "2026-11-08",
      // ₹1,18,000 − ₹10,000 TDS = ₹1,08,000
      amountPaise: 10_800_000,
    });
    expect(text).toContain("Dear Acme Tech Pvt Ltd,");
    expect(text).toContain(
      "invoice B1/26-27/0001 for ₹1,08,000 is due on 08-11-2026",
    );
    expect(text).toContain("IFSC: HDFC0000123");
    expect(text).toContain("Demo Properties LLP");
  });

  it("after the due date: how many days overdue", () => {
    // Due 08-11, today 15-11: 7 days.
    const text = whatsappText(doc, {
      today: "2026-11-15",
      dueDate: "2026-11-08",
      amountPaise: 5_000_000,
    });
    expect(text).toContain(
      "invoice B1/26-27/0001 for ₹50,000 was due on 08-11-2026 (7 days ago)",
    );
  });

  it("on the due date says today", () => {
    expect(
      whatsappText(doc, {
        today: "2026-11-08",
        dueDate: "2026-11-08",
        amountPaise: 5_000_000,
      }),
    ).toContain("is due today");
  });
});

describe("whatsappLink", () => {
  it("opens a chat with the number and the message filled in", () => {
    expect(whatsappLink("+919820012345", "Due: ₹50,000 & more")).toBe(
      "https://wa.me/919820012345?text=Due%3A%20%E2%82%B950%2C000%20%26%20more",
    );
  });
});
