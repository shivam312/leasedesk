import { describe, expect, it } from "vitest";
import {
  billingMonth,
  emailAgainMessage,
  monthChoices,
  runSummary,
  sendAllConsequence,
  tooEarlyToSend,
  selectedInvoicesSchema,
  sendSummary,
} from "../forms";

const base = {
  runMonth: "2026-11",
  drafted: 0,
  alreadySent: 0,
  nothingToBill: 0,
  problems: [],
};

describe("billing month", () => {
  it("uses ?month= when it's a real month, else this month", () => {
    expect(billingMonth("2026-12", "2026-11-15")).toBe("2026-12");
    expect(billingMonth("2026-13", "2026-11-15")).toBe("2026-11");
    expect(billingMonth(undefined, "2026-11-15")).toBe("2026-11");
  });

  it("offers last month, this month and next month, across a year end", () => {
    expect(monthChoices("2026-12-31")).toEqual([
      { value: "2026-11", label: "Nov 2026" },
      { value: "2026-12", label: "Dec 2026" },
      { value: "2027-01", label: "Jan 2027" },
    ]);
  });
});

describe("runSummary", () => {
  it("counts the invoices made", () => {
    expect(runSummary({ ...base, drafted: 38 })).toEqual({
      message: "Made 38 invoices for Nov 2026. Check them, then send.",
      tone: "success",
      problems: [],
    });
    expect(runSummary({ ...base, drafted: 1 }).message).toMatch(
      /Made 1 invoice for/,
    );
  });

  it("is an error only when problems stopped every invoice", () => {
    const problems = [
      { leaseId: "l", tenantName: "Acme", message: "Add the GSTIN." },
    ];
    expect(runSummary({ ...base, problems }).tone).toBe("error");
  });

  it("says when there is nothing to bill", () => {
    expect(runSummary(base).message).toBe(
      "No leases need an invoice for Nov 2026. Check that each lease has started and has its rent set.",
    );
  });

  it("mentions invoices already sent and every problem", () => {
    const summary = runSummary({
      ...base,
      drafted: 2,
      alreadySent: 1,
      problems: [
        { leaseId: "l", tenantName: "Acme", message: "Add the GSTIN." },
      ],
    });
    expect(summary).toEqual({
      message:
        "Made 2 invoices for Nov 2026. Check them, then send. 1 tenant was already sent Nov 2026's invoice; it wasn't changed.",
      tone: "success",
      problems: ["Acme: Add the GSTIN."],
    });
  });
});

describe("sendSummary", () => {
  const emailed = (tenantName: string, number: string) => ({
    tenantName,
    number,
    email: { kind: "emailed" as const, to: ["a@b.in"] },
  });

  it("counts the invoices sent", () => {
    expect(
      sendSummary({
        sent: [
          emailed("Acme", "B1/26-27/0001"),
          emailed("Zen", "B1/26-27/0002"),
        ],
        alreadySent: 0,
        problems: [],
      }),
    ).toEqual({ message: "Sent 2 invoices.", tone: "success", problems: [] });
  });

  it("says which tenants have no email and which emails failed, with what to do", () => {
    const s = sendSummary({
      sent: [
        emailed("Acme", "B1/26-27/0001"),
        {
          tenantName: "Bee",
          number: "B1/26-27/0002",
          email: { kind: "no_email" },
        },
        {
          tenantName: "Cee",
          number: "B1/26-27/0003",
          email: { kind: "failed", message: "The email couldn't be sent." },
        },
      ],
      alreadySent: 0,
      problems: [
        {
          tenantName: "Dee",
          message:
            "Add the GSTIN for X in Settings → Business details, then send again.",
        },
      ],
    });
    expect(s.tone).toBe("success");
    expect(s.message).toBe(
      "Sent 3 invoices. 1 tenant has no email address: open the invoice, download the PDF and send it yourself, or add a billing contact on the tenant's page. 1 email couldn't be sent: open the invoice and choose Email again.",
    );
    expect(s.problems).toEqual([
      "Dee: Add the GSTIN for X in Settings → Business details, then send again. It wasn't sent.",
      "Bee (B1/26-27/0002): no email address.",
      "Cee (B1/26-27/0003): the invoice was sent but the email failed (The email couldn't be sent). Open it and choose Email again.",
    ]);
  });

  it("is an error when nothing could be sent", () => {
    const s = sendSummary({
      sent: [],
      alreadySent: 0,
      problems: [{ tenantName: "Dee", message: "Too long." }],
    });
    expect(s).toMatchObject({
      message: "No invoices were sent.",
      tone: "error",
    });
  });

  it("says when someone else already sent them", () => {
    expect(
      sendSummary({ sent: [], alreadySent: 4, problems: [] }).message,
    ).toBe("These invoices were already sent.");
  });
});

describe("emailAgainMessage", () => {
  it("names the addresses, or says what to do", () => {
    expect(
      emailAgainMessage({ kind: "emailed", to: ["a@b.in", "c@d.in"] }),
    ).toEqual({
      message: "Emailed to a@b.in, c@d.in.",
      tone: "success",
    });
    expect(emailAgainMessage({ kind: "no_email" }).tone).toBe("error");
    expect(
      emailAgainMessage({ kind: "failed", message: "Down." }).message,
    ).toBe("Down. Try again in a few minutes.");
  });
});

describe("sendAllConsequence", () => {
  it("says what sending does when every tenant has an email address", () => {
    expect(sendAllConsequence([])).toBe(
      "Each gets its invoice number and is emailed with its PDF to the tenant's billing contacts. Sent invoices can't be changed; corrections are credit notes.",
    );
  });

  it("warns before sending when tenants have no email address", () => {
    expect(sendAllConsequence(["Acme"])).toMatch(
      /Acme has no email address, so its invoice will be numbered but not emailed: download the PDF and send it yourself\.$/,
    );
    expect(sendAllConsequence(["Acme", "Birla", "Cipla"])).toMatch(
      /3 tenants have no email address \(Acme, Birla, Cipla\), so their invoices will be numbered but not emailed: download the PDFs and send them yourself\.$/,
    );
  });
});

describe("tooEarlyToSend", () => {
  it("refuses to send before the invoice date, and allows it from that day", () => {
    // November's invoices are dated 01-11-2026 (D23): a run on 25 October
    // makes them, but they can't be issued with a future date (D-016).
    expect(tooEarlyToSend("2026-11-01", "2026-10-25")).toBe(
      "Invoices dated 01-11-2026 can be sent from that day, not before.",
    );
    expect(tooEarlyToSend("2026-11-01", "2026-11-01")).toBeNull();
    expect(tooEarlyToSend("2026-11-01", "2026-12-03")).toBeNull();
  });
});

describe("selectedInvoicesSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("reads the chosen drafts' ids", () => {
    expect(
      selectedInvoicesSchema.parse({
        month: "2026-11",
        invoiceIds: `${id},${id}`,
      }),
    ).toEqual({ month: "2026-11", invoiceIds: [id, id] });
  });

  it("needs at least one, and only ids", () => {
    expect(
      selectedInvoicesSchema.safeParse({ month: "2026-11", invoiceIds: "" })
        .success,
    ).toBe(false);
    expect(
      selectedInvoicesSchema.safeParse({ month: "2026-11", invoiceIds: "x" })
        .success,
    ).toBe(false);
  });
});
