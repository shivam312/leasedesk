import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/settings/schema";
import { leaseInputFor, parseLeaseForm, type LeaseFormInput } from "../draft";

const T = "6a83f208-084f-433c-930c-5093ae808f43";
const B = "64a547af-6134-4e8b-89b0-087288c81a1a";
const U1 = "0c5b3b0e-6a4c-4b8e-9d7f-1f2e3d4c5b6a";
const U2 = "1d6c4c1f-7b5d-4c9f-8e80-2a3f4e5d6c7b";

const input = (over: Partial<LeaseFormInput> = {}): LeaseFormInput => ({
  tenantId: T,
  buildingId: B,
  unitIds: [U1, U2],
  areaBasis: "chargeable",
  startDate: "2026-04-01",
  endDate: "2029-03-31",
  lockInEndDate: "",
  noticePeriodMonths: "3",
  rentFree: "months",
  rentFreeLength: "2",
  deposit: "6,00,000",
  charges: [{ type: "rent", basis: "per_sqft", amount: "100" }],
  rules: [{ percent: "5", everyMonths: "12" }],
  settings: {},
  ...over,
});

const units = [
  { id: U1, carpetArea: 60000, chargeableArea: 80000 },
  { id: U2, carpetArea: 15000, chargeableArea: 20000 },
];

describe("parseLeaseForm", () => {
  it("refuses a charge that ends before the lease starts when its start is blank", () => {
    // A blank start means the lease's, 01-04-2026; ending 31-03-2026 is a day
    // before that, so the charge would bill nothing and fail the database
    // check. The user goes back to the charges step.
    const result = parseLeaseForm(
      input({
        charges: [
          { type: "rent", basis: "per_sqft", amount: "100" },
          { type: "cam", basis: "fixed", amount: "5000", endDate: "2026-03-31" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.step).toBe("charges");
    expect(result.errors).toEqual({
      "charges.1.endDate": "A charge can't end before it starts.",
    });
  });

  it("reads a complete lease", () => {
    const result = parseLeaseForm(input());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.draft.dates).toMatchObject({
      rentFreeMonths: 2,
      rentFreeDays: 0,
      noticePeriodMonths: 3,
    });
    // ₹6,00,000 = 6,00,00,000 paise.
    expect(result.draft.depositPaise).toBe(60_000_000);
    expect(result.draft.charges[0]).toMatchObject({ amount: 10000 });
    expect(result.draft.rules).toEqual([
      {
        percentBp: 500,
        everyMonths: 12,
        anchor: "lease_start",
        compounding: true,
      },
    ]);
    expect(result.draft.settings).toEqual({});
  });

  it("sends the user back to the first step with a mistake", () => {
    const result = parseLeaseForm(
      input({
        unitIds: [],
        endDate: "2026-03-01",
        charges: [{ type: "rent", basis: "per_sqft", amount: "abc" }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.step).toBe("parties");
    expect(result.errors).toMatchObject({
      unitIds: "Choose at least one unit.",
      endDate: "The lease can't end before it starts.",
      "charges.0.amount": "Enter the amount in rupees, like 85.50 or 1,25,000.",
    });
  });

  it("needs at least one charge, and a rent charge for rent increases", () => {
    const none = parseLeaseForm(input({ charges: [], rules: [] }));
    expect(none.ok || none.errors.charges).toBe(
      "Add the rent, or another charge.",
    );
    const noRent = parseLeaseForm(
      input({ charges: [{ type: "cam", basis: "fixed", amount: "15000" }] }),
    );
    expect(noRent.ok || noRent.errors.rules).toBe(
      "Rent increases need a rent charge. Add the rent, or remove the increase.",
    );
  });

  it("checks the deposit and the lease's own settings", () => {
    const result = parseLeaseForm(
      input({
        deposit: "-5",
        settings: { billing__monthEndRule: "sometimes" },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.deposit).toBe(
      "Enter the deposit in rupees, like 6,00,000, or leave it blank.",
    );
    expect(result.errors["settings.billing__monthEndRule"]).toBeDefined();
    expect(result.step).toBe("dates");
  });

  it("keeps only the lease settings that were set", () => {
    const result = parseLeaseForm(
      input({ deposit: "", settings: { billing__monthEndRule: "last_day" } }),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.draft.depositPaise).toBe(0);
    expect(result.draft.settings).toEqual({
      "billing.monthEndRule": "last_day",
    });
  });
});

describe("leaseInputFor", () => {
  it("builds the engine's lease from the draft, units and building defaults", () => {
    const result = parseLeaseForm(input());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const built = leaseInputFor(result.draft, {
      id: "L1",
      units,
      settings: defaultSettings(),
      chargeIds: ["c-rent"],
    });
    // Chargeable area 800 + 200 = 1,000 sq ft = 1,00,000 hundredths.
    expect(built.areaHundredths).toBe(100000);
    expect(built.unitAreas).toEqual([
      { unitId: U1, area: 80000 },
      { unitId: U2, area: 20000 },
    ]);
    // Start 01-04-2026 + 2 rent-free months = 01-06-2026.
    expect(built.rentCommencementDate).toBe("2026-06-01");
    expect(built.lease).toMatchObject({
      id: "L1",
      startDate: "2026-04-01",
      endDate: "2029-03-31",
      rentFreeMonths: 2,
      rentFreeDays: 0,
      noticePeriodMonths: 3,
      lockInEndDate: null,
    });
    // Blank timing, GST and SAC take the building defaults (D16).
    expect(built.lease.charges).toEqual([
      {
        id: "c-rent",
        type: "rent",
        basis: "per_sqft",
        ratePaise: 10000,
        areaHundredths: 100000,
        startDate: "2026-04-01",
        frequency: "monthly",
        timing: "advance",
        gstRateBp: 1800,
        sacCode: "997212",
        waivedDuringRentFree: true,
      },
    ]);
    expect(built.lease.escalationRules).toHaveLength(1);
  });

  it("uses carpet area when the lease says so", () => {
    const result = parseLeaseForm(input({ areaBasis: "carpet" }));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    // Carpet area 600 + 150 = 750 sq ft.
    expect(
      leaseInputFor(result.draft, {
        id: "L1",
        units,
        settings: defaultSettings(),
      }).areaHundredths,
    ).toBe(75000);
  });

  it("refuses a unit that isn't in the building", () => {
    const result = parseLeaseForm(input());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(() =>
      leaseInputFor(result.draft, {
        id: "L1",
        units: units.slice(0, 1),
        settings: defaultSettings(),
      }),
    ).toThrow("One of the chosen units isn't in this building.");
  });
});
