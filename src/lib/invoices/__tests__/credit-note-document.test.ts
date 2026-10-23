import { describe, expect, it } from "vitest";
import { creditNoteDocument } from "../credit-note-document";
import { invoiceEmail } from "../email";
import { source } from "./fixtures";

const invoice = source().invoice;
// Waive ₹5,000 of maintenance: CGST and SGST 9% = ₹450 each; total ₹5,900.
const src = {
  note: {
    number: "TCN/26-27/0001",
    date: "2026-11-20",
    reason: "waiver" as const,
    note: "Lift out of service for a week",
    supplyType: "intra_state" as const,
    taxableAmount: 500000,
    cgst: 45000,
    sgst: 45000,
    igst: 0,
    roundOff: 0,
    total: 590000,
  },
  invoice,
  lines: [
    {
      line: {
        description: "Maintenance (CAM) for Nov 2026",
        taxableAmount: 500000,
        gstRateBp: 1800,
        cgst: 45000,
        sgst: 45000,
        igst: 0,
      },
      sacCode: "997212",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    },
  ],
};

describe("creditNoteDocument", () => {
  it("prints a credit note against its invoice from the invoice's sent copies", () => {
    const doc = creditNoteDocument(src);
    expect(doc).toMatchObject({
      title: "Credit Note",
      numberLabel: "Credit note no",
      number: "TCN/26-27/0001",
      invoiceDate: "20-11-2026",
      dueDate: null,
      against: "B1/26-27/0001 dated 01-11-2026",
      reason: "Waiver: Lift out of service for a week",
      payment: null,
      supplier: { name: "Demo Properties LLP", gstin: "27AAPFU0939F1ZV" },
      recipient: { name: "Acme Tech Pvt Ltd" },
      taxColumns: ["CGST", "SGST"],
      footnote: "This is a computer-generated credit note.",
    });
    expect(doc.lines[0]!.taxes).toEqual(["CGST 9% ₹450", "SGST 9% ₹450"]);
    expect(doc.totals.at(-1)).toEqual({
      label: "Credit note total",
      amount: "₹5,900",
    });
  });

  it("refuses an invoice without its sent copies", () => {
    expect(() =>
      creditNoteDocument({ ...src, invoice: { ...invoice, supplier: null } }),
    ).toThrow(/copies/);
  });

  it("emails as a credit note, asking for nothing", () => {
    const email = invoiceEmail(
      creditNoteDocument(src),
      ["a@acme.in"],
      Buffer.from("%PDF"),
    );
    expect(email.subject).toBe(
      "Credit note TCN/26-27/0001 from Demo Properties LLP against invoice B1/26-27/0001",
    );
    expect(email.text).toContain("Credit note total: ₹5,900");
    expect(email.text).toContain("Reason: Waiver: Lift out of service");
    expect(email.text).not.toContain("Amount to pay");
    expect(email.attachments![0]!.filename).toBe(
      "Credit-note-TCN-26-27-0001.pdf",
    );
  });
});
