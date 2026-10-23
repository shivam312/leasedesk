import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { parseWorkbookSheets } from "@/lib/bank/xlsx";
import { DEFAULT_SETTINGS } from "@/lib/billing/__tests__/billing-settings";
import type { LeaseInput } from "@/lib/billing/schedule";
import type { Charge } from "@/lib/billing/types";
import { parseLeaseForm } from "@/lib/leases/draft";
import { readRows } from "../sheets";
import {
  rentTodayProblem,
  threeMonths,
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
        amount: "300000.00",
        frequency: "quarterly",
      },
    ]);
    expect("input" in mapped && mapped.input.rules).toEqual([]);
    expect("input" in mapped && mapped.input.startDate).toBe("2025-04-01");
  });

  it("counts increases from lease start, or from rent start when asked", () => {
    const rule = (increaseFrom: string) => {
      const mapped = leaseRowInput(
        { ...leaseExample, increase: "5", increaseFrom },
        lookup,
      );
      return "input" in mapped ? mapped.input.rules[0]?.anchor : mapped.error;
    };
    expect(rule("")).toBe("lease_start");
    expect(rule("Lease start")).toBe("lease_start");
    expect(rule("rent start")).toBe("rent_commencement");
    const rentStart = leaseRowInput(
      { ...leaseExample, increase: "5", increaseFrom: "Rent start" },
      lookup,
    );
    expect("input" in rentStart && parseLeaseForm(rentStart.input).ok).toBe(
      true,
    );
    expect(rule("someday")).toBe(
      'Type "Lease start" or "Rent start" under "Increase counted from", or leave it blank for lease start.',
    );
  });

  it("refuses a rate per sq ft that is surely the whole monthly rent", () => {
    // 1,50,000 with "Rent is" blank would be ₹1,50,000 per sq ft a month.
    expect(
      leaseRowInput(
        { ...leaseExample, rent: "1,50,000", rentBasis: "" },
        lookup,
      ),
    ).toEqual({
      error:
        'Rent at lease start (₹): ₹1,50,000 per sq ft a month is more than ₹2,000. If it is the whole rent, type "per month" under "Rent is".',
    });
    // ₹2,000 per sq ft is still taken as a rate.
    expect(
      "input" in
        leaseRowInput({ ...leaseExample, rent: "2000", rentBasis: "" }, lookup),
    ).toBe(true);
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

describe("threeMonths", () => {
  it("triples rupees exactly, in paise", () => {
    // ₹1,00,000 × 3 = ₹3,00,000; ₹33,333.33 × 3 = ₹99,999.99
    expect(threeMonths("1,00,000")).toBe("300000.00");
    expect(threeMonths("33333.33")).toBe("99999.99");
    expect(threeMonths("lots")).toBe("lots");
  });
});

describe("rentTodayProblem", () => {
  // 01-04-2025 to 31-03-2030, 5% every 12 months from lease start.
  const lease = (charge: Partial<Charge>): LeaseInput => ({
    id: "l1",
    startDate: "2025-04-01",
    endDate: "2030-03-31",
    charges: [
      {
        id: "rent",
        type: "rent",
        basis: "fixed",
        amountPaise: 10_000_000,
        startDate: "2025-04-01",
        gstRateBp: 1800,
        sacCode: "997212",
        ...charge,
      } as Charge,
    ],
    escalationRules: [
      { percentBp: 500, everyMonths: 12, anchor: "lease_start" },
    ],
  });
  const fixed = lease({});

  it("no increase yet: Rent today can stay blank", () => {
    expect(rentTodayProblem(fixed, DEFAULT_SETTINGS, "", "2026-02-01")).toBe(
      null,
    );
  });

  it("an increase already billed: Rent today is needed", () => {
    // ₹1,00,000 × 1.05 = ₹1,05,000 from 01-04-2026
    expect(rentTodayProblem(fixed, DEFAULT_SETTINGS, "", "2026-11-01")).toBe(
      "Rent today (₹): this lease's rent has gone up since it started. Type the rent billed now, so the app can check the increases: from the rent at lease start they come to ₹1,05,000 a month.",
    );
  });

  it("Rent today matching the increases is accepted", () => {
    expect(
      rentTodayProblem(fixed, DEFAULT_SETTINGS, "1,05,000", "2026-11-01"),
    ).toBe(null);
  });

  it("today's rent typed as the starting rent is refused, not billed twice increased", () => {
    // Typed 1,05,000 as the rent at start: × 1.05 = ₹1,10,250 today,
    // while the landlord bills ₹1,05,000.
    const typedToday = lease({ amountPaise: 10_500_000 });
    expect(
      rentTodayProblem(typedToday, DEFAULT_SETTINGS, "1,05,000", "2026-11-01"),
    ).toBe(
      "Rent today (₹): the rent at lease start with its increases comes to ₹1,10,250 a month today, not ₹1,05,000. Type the rent from the lease's first month under Rent at lease start.",
    );
  });

  it("per sq ft: today's rate rounded to the paisa is accepted", () => {
    // ₹85.50 × 1,250.50 sq ft = ₹1,06,917.75; × 1.05 = ₹1,12,263.64,
    // rounded to ₹1,12,264. Today's rate 1,12,264 ÷ 1,250.50 = ₹89.775…
    // typed as 89.78: × 1,250.50 = ₹1,12,269.89, within half a paisa a
    // sq ft (₹6.26) and a rupee of rounding.
    const perSqft = lease({
      basis: "per_sqft",
      ratePaise: 8_550,
      areaHundredths: 125_050,
    } as Partial<Charge>);
    expect(
      rentTodayProblem(perSqft, DEFAULT_SETTINGS, "89.78", "2026-11-01"),
    ).toBe(null);
    // 89.78 typed as the starting rate: ₹1,17,877 today, not ₹1,12,270.
    const typedToday = lease({
      basis: "per_sqft",
      ratePaise: 8_978,
      areaHundredths: 125_050,
    } as Partial<Charge>);
    expect(
      rentTodayProblem(typedToday, DEFAULT_SETTINGS, "89.78", "2026-11-01"),
    ).toMatch(/^Rent today \(₹\): the rent at lease start/);
  });

  it("quarterly: Rent today is per month, like the rent", () => {
    // ₹3,00,000 a quarter, ₹1,05,000 a month after the first increase
    const quarterly = lease({
      amountPaise: 30_000_000,
      frequency: "quarterly",
    });
    expect(
      rentTodayProblem(quarterly, DEFAULT_SETTINGS, "1,05,000", "2026-11-01"),
    ).toBe(null);
  });

  it("a lease not running today isn't checked", () => {
    expect(rentTodayProblem(fixed, DEFAULT_SETTINGS, "", "2031-01-01")).toBe(
      null,
    );
  });

  it("Rent today that isn't an amount is refused", () => {
    expect(
      rentTodayProblem(fixed, DEFAULT_SETTINGS, "about 1 lakh", "2026-11-01"),
    ).toBe("Rent today (₹): type an amount in rupees, like 1,05,000 or 89.50.");
  });
});

describe("amounts with more than two decimals in the Excel file", () => {
  it("are refused on their row, not rounded to the paisa", () => {
    // ₹85.505 per sq ft and a ₹6,00,000.005 deposit aren't whole paise.
    // Rounding them to ₹85.51 and ₹6,00,000.01 would bill and hold amounts
    // nobody typed, so the row is refused and names the column.
    const values = (rent: unknown, deposit: unknown) =>
      LEASE_COLUMNS.map((c) =>
        c.key === "rent"
          ? rent
          : c.key === "deposit"
            ? deposit
            : (leaseExample[c.key] ?? ""),
      );
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        LEASE_COLUMNS.map((c) => c.heading),
        values(85.505, 600000),
        values(85.5, 600000.005),
      ]),
      "Leases",
    );
    const bytes = write(book, { type: "buffer", bookType: "xlsx" });
    const read = readRows(parseWorkbookSheets(bytes)[0]!, LEASE_COLUMNS);
    if ("error" in read) throw new Error(read.error.message);
    const messages = read.rows.map(({ values: v }) => {
      const mapped = leaseRowInput(v, lookup);
      if ("error" in mapped) return mapped.error;
      const form = parseLeaseForm(mapped.input);
      return form.ok
        ? "accepted"
        : leaseErrorMessage(form.errors, mapped.sources);
    });
    expect(messages[0]).toMatch(/^Rent: /);
    expect(messages[1]).toMatch(/^Deposit \(₹\): /);
  });
});
