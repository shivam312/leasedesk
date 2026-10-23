import { describe, expect, it } from "vitest";
import { parseLeaseForm } from "@/lib/leases/draft";
import {
  LEASE_COLUMNS,
  leaseErrorMessage,
  leaseRowInput,
  readTenantRow,
  TENANCY_TEMPLATE,
  TENANT_COLUMNS,
  type LeaseLookup,
} from "../tenancy";

const blankTenant = Object.fromEntries(
  TENANT_COLUMNS.map((c) => [c.key, ""]),
) as Record<(typeof TENANT_COLUMNS)[number]["key"], string>;
const blankLease = Object.fromEntries(
  LEASE_COLUMNS.map((c) => [c.key, ""]),
) as Record<(typeof LEASE_COLUMNS)[number]["key"], string>;
const tenantExample = { ...blankTenant, ...TENANCY_TEMPLATE.sheets[0].example };
const leaseExample = { ...blankLease, ...TENANCY_TEMPLATE.sheets[1].example };

const T = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const U301 = "00000000-0000-4000-8000-000000000301";
const U302 = "00000000-0000-4000-8000-000000000302";
const lookup: LeaseLookup = {
  tenantId: (n) => (n.toLowerCase() === "acme software pvt ltd" ? T : null),
  building: (n) =>
    n === "Orchid Towers"
      ? { id: B, unitId: (c) => ({ "301": U301, "302": U302 })[c] ?? null }
      : null,
};

describe("readTenantRow", () => {
  it("reads the template's example: state and PAN from the GSTIN, TDS at 10%", () => {
    const read = readTenantRow(tenantExample);
    if ("error" in read) throw new Error(read.error);
    expect(read.tenant).toMatchObject({
      companyName: "Acme Software Pvt Ltd",
      gstin: "27AABCA1234B1ZH",
      pan: "AABCA1234B",
      stateCode: "27",
      deductsTdsRent: true,
      tdsRateBpRent: 1000,
      deductsTdsCam: true,
    });
    expect(read.contact).toMatchObject({
      name: "Priya Shah",
      phone: "+919820012345",
      whatsapp: true,
    });
  });

  it("an unregistered tenant needs its state; TDS can be off", () => {
    const base = { ...tenantExample, gstin: "", deductsTds: "No" };
    expect(readTenantRow(base)).toEqual({
      error:
        "Type the state of the billing address (or the GSTIN, which includes it).",
    });
    const read = readTenantRow({ ...base, state: "Karnataka" });
    expect("tenant" in read && read.tenant).toMatchObject({
      stateCode: "29",
      deductsTdsRent: false,
      deductsTdsCam: false,
    });
  });

  it("says what's wrong in the form's own words", () => {
    expect(readTenantRow({ ...tenantExample, deductsTds: "maybe" })).toEqual({
      error: 'Type Yes or No under "Deducts TDS".',
    });
    expect(
      readTenantRow({ ...tenantExample, email: "", phone: "", whatsapp: "" }),
    ).toEqual({
      error:
        "Enter an email or a phone number, so invoices and reminders can reach them.",
    });
    expect(readTenantRow({ ...tenantExample, state: "Karnataka" })).toEqual({
      error: "This GSTIN is registered in Maharashtra. Choose that state.",
    });
  });
});

describe("leaseRowInput", () => {
  it("turns the template's example into the lease form's input", () => {
    const mapped = leaseRowInput(leaseExample, lookup);
    if ("error" in mapped) throw new Error(mapped.error);
    expect(mapped.sources).toEqual(["Rent", "Maintenance", "Parking"]);
    expect(mapped.input).toEqual({
      tenantId: T,
      buildingId: B,
      unitIds: [U301, U302],
      areaBasis: "chargeable",
      startDate: "2025-04-01",
      endDate: "2030-03-31",
      lockInEndDate: "2027-03-31",
      noticePeriodMonths: "3",
      rentFree: "months",
      rentFreeLength: "2",
      deposit: "6,00,000",
      charges: [
        {
          type: "rent",
          basis: "per_sqft",
          amount: "85.50",
          frequency: "monthly",
        },
        { type: "cam", basis: "per_sqft", amount: "12", frequency: "monthly" },
        {
          type: "parking",
          basis: "per_slot",
          amount: "3,000",
          slots: "2",
          frequency: "monthly",
        },
      ],
      rules: [
        {
          percent: "5",
          everyMonths: "12",
          anchor: "lease_start",
          anchorDate: "",
          compounding: true,
        },
      ],
      settings: {},
    });
    // The lease form accepts it as it is.
    const form = parseLeaseForm(mapped.input);
    expect(form.ok).toBe(true);
    if (form.ok) {
      // ₹6,00,000 deposit; ₹85.50 per sq ft; 5% every 12 months
      expect(form.draft.depositPaise).toBe(60_000_000);
      expect(form.draft.charges[0]).toMatchObject({ amount: 8_550 });
      expect(form.draft.rules[0]).toMatchObject({
        percentBp: 500,
        everyMonths: 12,
      });
    }
  });

  it("a fixed monthly rent with no extras", () => {
    const mapped = leaseRowInput(
      {
        ...blankLease,
        tenant: "Acme Software Pvt Ltd",
        building: "Orchid Towers",
        units: "301",
        start: "1/4/2025",
        end: "31-03-2028",
        rent: "1,00,000",
        rentBasis: "Per month",
        rentFrequency: "Quarterly",
      },
      lookup,
    );
    expect("input" in mapped && mapped.input.charges).toEqual([
      {
        type: "rent",
        basis: "fixed",
        amount: "1,00,000",
        frequency: "quarterly",
      },
    ]);
    expect("input" in mapped && mapped.input.rules).toEqual([]);
    expect("input" in mapped && mapped.input.startDate).toBe("2025-04-01");
  });

  it("names an unknown tenant, building or unit, and refuses contradictions", () => {
    expect(leaseRowInput({ ...leaseExample, tenant: "Beta" }, lookup)).toEqual({
      error:
        "There's no tenant called Beta. Add it to the Tenants sheet, or check the spelling.",
    });
    expect(
      leaseRowInput({ ...leaseExample, units: "301, 999" }, lookup),
    ).toEqual({
      error: "Orchid Towers has no unit 999. Check the unit numbers.",
    });
    expect(
      leaseRowInput({ ...leaseExample, rentFreeDays: "15" }, lookup),
    ).toEqual({
      error: "Give the rent-free period in months or in days, not both.",
    });
    expect(
      leaseRowInput({ ...leaseExample, camPerMonth: "5000" }, lookup),
    ).toEqual({
      error: "Give maintenance per sq ft or per month, not both.",
    });
  });
});

describe("leaseErrorMessage", () => {
  it("names the column a lease form error belongs to", () => {
    const mapped = leaseRowInput(
      { ...leaseExample, end: "31-02-2030", parkingRate: "lots" },
      lookup,
    );
    if ("error" in mapped) throw new Error(mapped.error);
    const form = parseLeaseForm(mapped.input);
    expect(form.ok).toBe(false);
    if (!form.ok) {
      expect(leaseErrorMessage(form.errors, mapped.sources)).toBe(
        "Last day: Enter the last day of the lease.",
      );
      expect(
        leaseErrorMessage(
          { "charges.2.amount": "Enter the amount in rupees." },
          mapped.sources,
        ),
      ).toBe("Parking: Enter the amount in rupees.");
    }
  });
});
