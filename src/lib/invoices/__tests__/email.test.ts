import { describe, expect, it } from "vitest";
import { invoiceDocument } from "../document";
import { invoiceEmail, invoiceRecipients } from "../email";
import { emailInvoice } from "../send";
import { EmailError, type Email, type EmailDriver } from "@/lib/email";
import { source } from "./fixtures";

const contact = (
  email: string | null,
  role: "billing" | "admin" | "legal" | "other" = "billing",
  isPrimary = false,
) => ({ email, role, isPrimary });

describe("invoiceRecipients", () => {
  it("emails every billing contact, each address once", () => {
    expect(
      invoiceRecipients([
        contact("Accounts@Acme.in"),
        contact("accounts@acme.in "),
        contact("cfo@acme.in"),
        contact("legal@acme.in", "legal", true),
        contact(null),
      ]),
    ).toEqual(["accounts@acme.in", "cfo@acme.in"]);
  });

  it("falls back to the primary contact when no billing contact has an email", () => {
    expect(
      invoiceRecipients([
        contact(null),
        contact("ops@acme.in", "admin"),
        contact("owner@acme.in", "other", true),
      ]),
    ).toEqual(["owner@acme.in"]);
  });

  it("returns nobody when there's no billing or primary address", () => {
    expect(invoiceRecipients([contact("ops@acme.in", "admin")])).toEqual([]);
    expect(invoiceRecipients([])).toEqual([]);
  });
});

describe("invoiceEmail", () => {
  it("names the invoice, the amount to pay less TDS, the due date and the bank", () => {
    const doc = invoiceDocument(source());
    const pdf = Buffer.from("%PDF");
    const email = invoiceEmail(doc, ["accounts@acme.in"], pdf);
    expect(email.to).toEqual(["accounts@acme.in"]);
    expect(email.subject).toBe(
      "Invoice B1/26-27/0001 from Demo Properties LLP, due 08-11-2026",
    );
    // ₹1,18,000 total less ₹10,000 expected TDS = ₹1,08,000 (D24).
    expect(email.text).toContain(
      "Amount to pay: ₹1,08,000 (total ₹1,18,000 less TDS ₹10,000)",
    );
    expect(email.text).toContain("Dear Acme Tech Pvt Ltd,");
    expect(email.text).toContain("IFSC: HDFC0000123");
    expect(email.text).toContain("Please quote B1/26-27/0001");
    expect(email.attachments).toEqual([
      { filename: "Invoice-B1-26-27-0001.pdf", content: pdf },
    ]);
  });
});

describe("invoiceEmail for an invoice that asks for nothing", () => {
  it("sends a copy with its total, and no amount to pay or bank details", () => {
    const doc = invoiceDocument(source({ status: "part_paid" }));
    const email = invoiceEmail(doc, ["a@acme.in"], Buffer.from("%PDF"));
    expect(email.text).toContain("Invoice total: ₹1,18,000");
    expect(email.text).not.toContain("Amount to pay");
    expect(email.text).not.toContain("IFSC");
  });
});

describe("emailInvoice", () => {
  const doc = invoiceDocument(source());
  const render = async () => Buffer.from("%PDF");
  const recording = () => {
    const sent: Email[] = [];
    const driver: EmailDriver = {
      async send(email) {
        sent.push(email);
        return { id: "1", driver: "console" };
      },
    };
    return { sent, driver };
  };

  it("sends the PDF to the recipients", async () => {
    const { sent, driver } = recording();
    expect(await emailInvoice(doc, ["a@acme.in"], driver, render)).toEqual({
      kind: "emailed",
      to: ["a@acme.in"],
    });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when there's no address", async () => {
    const { sent, driver } = recording();
    expect(await emailInvoice(doc, [], driver, render)).toEqual({
      kind: "no_email",
    });
    expect(sent).toHaveLength(0);
  });

  it("reports a failed send instead of throwing, with the driver's own words", async () => {
    const failing: EmailDriver = {
      async send() {
        throw new EmailError("Resend refused the sender address.");
      },
    };
    expect(await emailInvoice(doc, ["a@acme.in"], failing, render)).toEqual({
      kind: "failed",
      message: "Resend refused the sender address.",
    });
    const broken = async () => {
      throw new Error("font missing");
    };
    expect(
      await emailInvoice(doc, ["a@acme.in"], recording().driver, broken),
    ).toEqual({ kind: "failed", message: "The email couldn't be sent." });
  });
});
