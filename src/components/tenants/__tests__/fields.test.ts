import { describe, expect, it } from "vitest";
import { tenantFields } from "../fields";

describe("tenantFields: state", () => {
  const state = (fields: ReturnType<typeof tenantFields>) =>
    fields.find((f) => f.name === "stateCode")!;

  it("starts unchosen for a new tenant, so GST isn't split for the wrong state", () => {
    const f = state(tenantFields());
    expect(f.defaultValue).toBe("");
    expect(f.options?.[0]).toEqual({ value: "", label: "Choose a state" });
  });

  it("keeps a saved tenant's state, with no blank choice", () => {
    const f = state(
      tenantFields({
        companyName: "Acme",
        gstin: null,
        pan: null,
        billingAddress: "Pune",
        stateCode: "29",
        deductsTdsRent: true,
        tdsRateBpRent: 1000,
        deductsTdsCam: true,
        tdsRateBpCam: 1000,
        deductsTdsParking: true,
        tdsRateBpParking: 1000,
        deductsTdsOther: true,
        tdsRateBpOther: 1000,
        notes: null,
      }),
    );
    expect(f.defaultValue).toBe("29");
    expect(f.options?.some((o) => o.value === "")).toBe(false);
  });
});
