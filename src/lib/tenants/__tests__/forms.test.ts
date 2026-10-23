import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/auth/forms";
import { makeGstin } from "@/lib/india/identifiers";
import {
  contactSchema,
  normalizePhone,
  tenantSchema,
  withAutoSend,
} from "../forms";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

const tenant = {
  companyName: "Acme Software Pvt Ltd",
  gstin: "",
  pan: "",
  billingAddress: "101, Andheri East, Mumbai",
  stateCode: "27",
  deductsTdsRent: "yes",
  tdsRateRent: "",
  deductsTdsCam: "same",
  tdsRateCam: "",
  deductsTdsParking: "same",
  tdsRateParking: "",
  deductsTdsOther: "same",
  tdsRateOther: "",
  notes: "",
};

describe("tenant form: TDS per charge type (D10)", () => {
  it("defaults: 10% on everything, following rent", () => {
    expect(parseForm(tenantSchema, form(tenant))).toMatchObject({
      data: {
        deductsTdsRent: true,
        tdsRateBpRent: 1000,
        deductsTdsCam: true,
        tdsRateBpCam: 1000,
        deductsTdsParking: true,
        deductsTdsOther: true,
        tdsRateBpOther: 1000,
      },
    });
  });

  it("no TDS on rent: the other types follow unless set", () => {
    expect(
      parseForm(
        tenantSchema,
        form({
          ...tenant,
          deductsTdsRent: "no",
          deductsTdsParking: "yes",
          tdsRateParking: "2",
        }),
      ),
    ).toMatchObject({
      data: {
        deductsTdsRent: false,
        deductsTdsCam: false,
        deductsTdsParking: true,
        tdsRateBpParking: 200,
        deductsTdsOther: false,
      },
    });
  });

  it("CAM at 2% while rent is 10%", () => {
    expect(
      parseForm(tenantSchema, form({ ...tenant, tdsRateCam: "2" })),
    ).toMatchObject({
      data: { tdsRateBpRent: 1000, tdsRateBpCam: 200 },
    });
  });

  it("takes the PAN from the GSTIN, and refuses a PAN that doesn't match it", () => {
    const gstin = makeGstin("27", "AABCA1234F");
    expect(parseForm(tenantSchema, form({ ...tenant, gstin }))).toMatchObject({
      data: { gstin, pan: "AABCA1234F" },
    });
    const result = parseForm(
      tenantSchema,
      form({ ...tenant, gstin, pan: "AABCB1234F" }),
    );
    expect("state" in result && result.state.fieldErrors?.pan).toBe(
      "This PAN doesn't match the one inside the GSTIN.",
    );
  });

  it("explains a bad TDS rate", () => {
    const result = parseForm(
      tenantSchema,
      form({ ...tenant, tdsRateRent: "ten" }),
    );
    expect("state" in result && result.state.fieldErrors?.tdsRateRent).toBe(
      "Enter the TDS rate on rent as a percentage, like 10.",
    );
  });

  it("names maintenance in plain words (glossary: Maintenance (CAM))", () => {
    const result = parseForm(
      tenantSchema,
      form({ ...tenant, deductsTdsCam: "yes", tdsRateCam: "two" }),
    );
    expect("state" in result && result.state.fieldErrors?.tdsRateCam).toBe(
      "Enter the TDS rate on maintenance (CAM) as a percentage, like 10.",
    );
  });
});

describe("contacts", () => {
  it("normalizes Indian phone numbers", () => {
    expect(normalizePhone("98200 12345")).toBe("+919820012345");
    expect(normalizePhone("+91-98200-12345")).toBe("+919820012345");
    expect(normalizePhone("09820012345")).toBe("+919820012345");
    expect(normalizePhone("12")).toBeNull();
  });

  it("needs an email or a phone, and a phone for WhatsApp", () => {
    const base = {
      name: "Priya",
      role: "billing",
      email: "",
      phone: "",
      whatsapp: "no",
    };
    const none = parseForm(contactSchema, form(base));
    expect("state" in none && none.state.fieldErrors?.email).toMatch(
      /email or a phone/,
    );
    const wa = parseForm(
      contactSchema,
      form({ ...base, email: "p@acme.in", whatsapp: "yes" }),
    );
    expect("state" in wa && wa.state.fieldErrors?.phone).toBe(
      "Enter the phone number for WhatsApp.",
    );
    expect(
      parseForm(
        contactSchema,
        form({ ...base, phone: "9820012345", whatsapp: "yes" }),
      ),
    ).toMatchObject({
      data: { phone: "+919820012345", whatsapp: true, email: null },
    });
  });
});

describe("withAutoSend", () => {
  it("sets or clears the tenant's own reminder setting, keeping the rest", () => {
    const stored = { "invoice.dueDays": 10 };
    expect(withAutoSend(stored, "false")).toEqual({
      "invoice.dueDays": 10,
      "reminders.autoSend": false,
    });
    expect(withAutoSend(stored, "true")).toEqual({
      "invoice.dueDays": 10,
      "reminders.autoSend": true,
    });
    // Blank: follow the business setting again.
    expect(
      withAutoSend({ ...stored, "reminders.autoSend": false }, ""),
    ).toEqual({ "invoice.dueDays": 10 });
  });
});
