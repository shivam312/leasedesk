import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/auth/forms";
import {
  buildingSchema,
  prefixClash,
  hundredthsToSqft,
  sqftToHundredths,
  unitSchema,
} from "../forms";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe("areas", () => {
  it("sq ft ↔ hundredths without floats", () => {
    expect(sqftToHundredths("1250.5")).toBe(125050);
    expect(sqftToHundredths("1,250.50")).toBe(125050);
    expect(sqftToHundredths("800")).toBe(80000);
    expect(sqftToHundredths("12.345")).toBeNull();
    expect(hundredthsToSqft(125050)).toBe("1250.50");
    expect(hundredthsToSqft(80000)).toBe("800");
  });
});

describe("unit form", () => {
  const unit = {
    code: "301",
    floorId: "",
    carpetArea: "1250.50",
    chargeableArea: "",
    status: "vacant",
  };

  it("billed area left blank is the carpet area", () => {
    expect(parseForm(unitSchema, form(unit))).toEqual({
      data: {
        code: "301",
        floorId: null,
        carpetArea: 125050,
        chargeableArea: 125050,
        status: "vacant",
      },
    });
  });

  it("explains a bad area", () => {
    const result = parseForm(unitSchema, form({ ...unit, carpetArea: "big" }));
    expect("state" in result && result.state.fieldErrors?.carpetArea).toBe(
      "Enter the carpet area in sq ft, like 1250 or 1250.50.",
    );
  });
});

describe("building form", () => {
  it("upper-cases prefixes and checks their length", () => {
    const base = {
      name: "Andheri Business Centre",
      address: "Plot 12, MIDC",
      city: "Mumbai",
      stateCode: "27",
      billingEntityId: "7d3c1d1e-4b8b-4a59-9d38-2f5d2a0c9b11",
      creditNotePrefix: "abccn",
    };
    expect(
      parseForm(buildingSchema, form({ ...base, invoicePrefix: "abc" })),
    ).toMatchObject({
      data: { invoicePrefix: "ABC", creditNotePrefix: "ABCCN" },
    });
    const result = parseForm(
      buildingSchema,
      form({ ...base, invoicePrefix: "TOOLONG" }),
    );
    expect(
      "state" in result && result.state.fieldErrors?.invoicePrefix,
    ).toMatch(/1 to 5/);
  });
});

describe("prefixClash", () => {
  const b1 = { invoicePrefix: "B1", creditNotePrefix: "B1CN" };

  it("allows distinct prefixes, and buildings sharing an invoice prefix (one series)", () => {
    expect(
      prefixClash({ invoicePrefix: "B2", creditNotePrefix: "B2CN" }, [b1]),
    ).toBeNull();
    expect(
      prefixClash({ invoicePrefix: "B1", creditNotePrefix: "B1CN" }, [b1]),
    ).toBeNull();
  });

  it("refuses a credit note prefix equal to the invoice prefix", () => {
    // B1/26-27/0001 would be both an invoice and a credit note.
    expect(
      prefixClash({ invoicePrefix: "B1", creditNotePrefix: "B1" }, []),
    ).toEqual({
      creditNotePrefix:
        "Use a different prefix from the invoice prefix, so no credit note has an invoice's number.",
    });
  });

  it("refuses a credit note prefix another building under this GSTIN uses for invoices", () => {
    expect(
      prefixClash({ invoicePrefix: "B2", creditNotePrefix: "B1" }, [b1]),
    ).toEqual({
      creditNotePrefix:
        "Another building billing from this GSTIN uses B1 for invoices. Choose a different credit note prefix.",
    });
  });

  it("refuses an invoice prefix another building under this GSTIN uses for credit notes", () => {
    expect(
      prefixClash({ invoicePrefix: "B1CN", creditNotePrefix: "XCN" }, [b1]),
    ).toEqual({
      invoicePrefix:
        "Another building billing from this GSTIN uses B1CN for credit notes. Choose a different invoice prefix.",
    });
  });
});
