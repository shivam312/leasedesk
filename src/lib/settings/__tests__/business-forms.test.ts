import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/auth/forms";
import { makeGstin } from "@/lib/india/identifiers";
import { billingEntitySchema, organizationSchema } from "../business-forms";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

const entity = {
  legalName: "Mehta Properties Pvt Ltd",
  gstin: "",
  stateCode: "27",
  address: "4th Floor, Andheri East, Mumbai 400069",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  ifsc: "",
  upiId: "",
};

describe("organization form", () => {
  it("normalizes the PAN and stores blanks as empty", () => {
    expect(
      parseForm(
        organizationSchema,
        form({ name: "Mehta", legalName: "", pan: "aabcd 1234e" }),
      ),
    ).toEqual({ data: { name: "Mehta", legalName: null, pan: "AABCD1234E" } });
  });

  it("explains a wrong PAN", () => {
    const result = parseForm(
      organizationSchema,
      form({ name: "Mehta", legalName: "", pan: "123" }),
    );
    expect("state" in result && result.state.fieldErrors?.pan).toMatch(
      /5 letters, 4 digits/,
    );
  });
});

describe("billing entity form", () => {
  it("accepts an unregistered landlord with no GSTIN or bank details", () => {
    const result = parseForm(billingEntitySchema, form(entity));
    expect(result).toMatchObject({
      data: { gstin: null, stateCode: "27", upiId: null },
    });
  });

  it("accepts a full entity and cleans up typing", () => {
    const gstin = makeGstin("27", "AABCD1234E");
    const result = parseForm(
      billingEntitySchema,
      form({
        ...entity,
        gstin: gstin.toLowerCase(),
        bankAccountNumber: "0001 2345 6789",
        ifsc: "hdfc0000123",
        upiId: "mehta@hdfcbank",
      }),
    );
    expect(result).toMatchObject({
      data: { gstin, bankAccountNumber: "000123456789", ifsc: "HDFC0000123" },
    });
  });

  it("refuses a GSTIN from another state than the one chosen", () => {
    const result = parseForm(
      billingEntitySchema,
      form({
        ...entity,
        gstin: makeGstin("29", "AABCD1234E"),
        stateCode: "27",
      }),
    );
    expect("state" in result && result.state.fieldErrors?.stateCode).toBe(
      "This GSTIN is registered in Karnataka. Choose that state.",
    );
  });

  it("explains a GSTIN typing mistake, a bad IFSC and a bad UPI ID", () => {
    const result = parseForm(
      billingEntitySchema,
      form({
        ...entity,
        gstin: "27AAPFU0939F1ZW",
        ifsc: "HDFC123",
        upiId: "mehta",
      }),
    );
    expect("state" in result && result.state.fieldErrors).toMatchObject({
      gstin: expect.stringMatching(/typing mistake/),
      ifsc: "An IFSC is 11 characters, like HDFC0000123.",
      upiId: "A UPI ID looks like name@bank.",
    });
  });
});
