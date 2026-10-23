import { describe, expect, it } from "vitest";
import { parsePaymentForm } from "../forms";

const tenantId = "8f8d2a52-5c43-4d4e-9a65-1f5a3c3b1a10";
const invoiceId = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

const form = (over: Record<string, string> = {}) =>
  Object.entries({
    tenantId,
    receivedDate: "2026-11-10",
    amountReceived: "1,08,000",
    tds: "10000",
    mode: "neft",
    reference: " UTR123 ",
    note: "",
    [`apply_${invoiceId}`]: "118000",
    ...over,
  });

describe("parsePaymentForm", () => {
  it("reads rupees with Indian grouping into paise", () => {
    expect(parsePaymentForm(form())).toEqual({
      data: {
        tenantId,
        receivedDate: "2026-11-10",
        amountReceivedPaise: 10_800_000,
        tdsPaise: 1_000_000,
        mode: "neft",
        reference: "UTR123",
        note: null,
        allocations: [{ invoiceId, amountPaise: 11_800_000 }],
      },
    });
  });

  it("treats empty TDS as none and leaves out invoices with 0", () => {
    const r = parsePaymentForm(form({ tds: "", [`apply_${invoiceId}`]: "0" }));
    expect(r).toMatchObject({ data: { tdsPaise: 0, allocations: [] } });
  });

  it("explains each wrong field in plain words, keeping what was typed", () => {
    const r = parsePaymentForm(
      form({
        amountReceived: "abc",
        tds: "-5",
        mode: "",
        receivedDate: "10-11-2026",
        [`apply_${invoiceId}`]: "1.234",
      }),
    );
    expect(r).toEqual({
      state: {
        fieldErrors: {
          amountReceived:
            "Enter the amount received in rupees, like 108000 or 1,08,000.50.",
          tds: "Enter the TDS in rupees, or leave it empty for none.",
          mode: "Choose how they paid.",
          receivedDate: "Enter the date the money reached your bank.",
          [`apply_${invoiceId}`]: "Enter an amount in rupees, or 0.",
        },
        values: expect.objectContaining({ amountReceived: "abc" }),
      },
    });
  });

  it("refuses an amount received of zero", () => {
    expect(parsePaymentForm(form({ amountReceived: "0" }))).toMatchObject({
      state: { fieldErrors: { amountReceived: expect.any(String) } },
    });
  });
});
