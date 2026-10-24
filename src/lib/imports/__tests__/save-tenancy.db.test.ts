import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { ImportRefused, importTenancy } from "../save-tenancy";
import { LEASE_COLUMNS, TENANT_COLUMNS } from "../tenancy";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

const tenantsSheet = (...rows: Record<string, string>[]) => ({
  name: "Tenants",
  rows: [
    TENANT_COLUMNS.map((c) => c.heading),
    ...rows.map((r) => TENANT_COLUMNS.map((c) => r[c.key] ?? "")),
  ],
});
const leasesSheet = (...rows: Record<string, string>[]) => ({
  name: "Leases",
  rows: [
    LEASE_COLUMNS.map((c) => c.heading),
    ...rows.map((r) => LEASE_COLUMNS.map((c) => r[c.key] ?? "")),
  ],
});

const beta = {
  name: "Beta Foods LLP",
  address: "Lower Parel, Mumbai",
  state: "Maharashtra",
  contactName: "Ravi",
  email: "ravi@beta.example",
};
const betaLease = {
  tenant: "Beta Foods LLP",
  building: "A Tower",
  units: "102",
  start: "01-04-2026",
  end: "31-03-2029",
  rent: "1,20,000",
  rentBasis: "per month",
  increase: "5",
};

async function withUnit102(tx: TestTx) {
  const a = await seedOrg(tx, "A");
  await tx
    .update(schema.leases)
    .set({ status: "active" })
    .where(eq(schema.leases.id, a.lease.id));
  await tx.insert(schema.units).values({
    organizationId: a.org.id,
    buildingId: a.building.id,
    code: "102",
    carpetArea: 100_000,
    chargeableArea: 120_000,
  });
  return { a, ctx: { userId: a.userId, organizationId: a.org.id } };
}

describe.skipIf(skipDbTests)("importTenancy", () => {
  afterAll(closeDb);

  it("records a deposit already held as received on the lease start", () =>
    inRollback(async (tx) => {
      const { ctx } = await withUnit102(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        importTenancy(
          s,
          [
            tenantsSheet(beta),
            leasesSheet({
              ...betaLease,
              deposit: "3,60,000",
              depositHeld: "3,60,000",
            }),
          ],
          "2026-10-23",
        ),
      );
      const entries = await tx
        .select({
          kind: schema.depositEntries.kind,
          date: schema.depositEntries.date,
          amount: schema.depositEntries.amount,
        })
        .from(schema.depositEntries);
      // ₹3,60,000 = 3,60,00,000 paise, on the lease start 01-04-2026.
      expect(entries).toEqual([
        { kind: "received", date: "2026-04-01", amount: 36_000_000 },
      ]);
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          importTenancy(
            s,
            [leasesSheet({ ...betaLease, units: "101", depositHeld: "5,000" })],
            "2026-10-23",
            { canRecordMoney: false },
          ),
        ),
      ).rejects.toBeInstanceOf(ImportRefused);
    }));

  it("saves an imported opening balance with its as-on date (D-028)", () =>
    inRollback(async (tx) => {
      const { ctx } = await withUnit102(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        importTenancy(
          s,
          [
            tenantsSheet({
              ...beta,
              opening: "2,50,000.50",
              openingAsOn: "30-09-2026",
            }),
          ],
          "2026-10-23",
        ),
      );
      const [row] = await tx
        .select({
          amount: schema.openingBalances.amount,
          asOnDate: schema.openingBalances.asOnDate,
          name: schema.tenants.companyName,
        })
        .from(schema.openingBalances)
        .innerJoin(
          schema.tenants,
          eq(schema.tenants.id, schema.openingBalances.tenantId),
        );
      // ₹2,50,000.50 = 2,50,00,050 paise.
      expect(row).toEqual({
        amount: 25_000_050,
        asOnDate: "2026-09-30",
        name: "Beta Foods LLP",
      });
    }));

  it("refuses an opening balance from someone who can't manage billing, or dated after today", () =>
    inRollback(async (tx) => {
      const { ctx } = await withUnit102(tx);
      const row = { ...beta, opening: "50,000", openingAsOn: "30-09-2026" };
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          importTenancy(s, [tenantsSheet(row)], "2026-10-23", {
            canRecordMoney: false,
          }),
        ),
      ).rejects.toBeInstanceOf(ImportRefused);
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          importTenancy(
            s,
            [tenantsSheet({ ...row, openingAsOn: "24-10-2026" })],
            "2026-10-23",
          ),
        ),
      ).rejects.toBeInstanceOf(ImportRefused);
    }));

  it("saves a tenant with its contact and a lease with its charges, rule and dates", () =>
    inRollback(async (tx) => {
      const { ctx } = await withUnit102(tx);
      const n = await runScoped(asDb(tx), ctx, (s) =>
        importTenancy(
          s,
          [tenantsSheet(beta), leasesSheet(betaLease)],
          "2026-10-23",
        ),
      );
      expect(n).toEqual({ tenants: 1, leases: 1 });
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.companyName, "Beta Foods LLP"));
      expect(tenant).toMatchObject({ stateCode: "27", deductsTdsRent: true });
      const [lease] = await tx
        .select()
        .from(schema.leases)
        .where(eq(schema.leases.tenantId, tenant!.id));
      expect(lease).toMatchObject({
        status: "active",
        startDate: "2026-04-01",
        endDate: "2029-03-31",
        version: 1,
      });
      const charges = await tx
        .select()
        .from(schema.leaseCharges)
        .where(eq(schema.leaseCharges.leaseId, lease!.id));
      // ₹1,20,000 a month, with the building's default GST and SAC
      expect(charges).toEqual([
        expect.objectContaining({
          type: "rent",
          basis: "fixed",
          rateOrAmount: 12_000_000,
          gstRateBp: 1800,
          sacCode: "997212",
        }),
      ]);
      const rules = await tx
        .select()
        .from(schema.escalationRules)
        .where(eq(schema.escalationRules.leaseId, lease!.id));
      expect(rules).toEqual([
        expect.objectContaining({ percentBp: 500, everyMonths: 12 }),
      ]);
      const dates = await tx
        .select()
        .from(schema.criticalDates)
        .where(eq(schema.criticalDates.leaseId, lease!.id));
      expect(dates.map((d) => d.type)).toContain("expiry");
      const contacts = await tx
        .select()
        .from(schema.tenantContacts)
        .where(eq(schema.tenantContacts.tenantId, tenant!.id));
      expect(contacts).toEqual([
        expect.objectContaining({ name: "Ravi", isPrimary: true }),
      ]);
    }));

  it("one bad row refuses the whole file, listing the rows to fix", () =>
    inRollback(async (tx) => {
      const { ctx } = await withUnit102(tx);
      const attempt = runScoped(asDb(tx), ctx, (s) =>
        importTenancy(
          s,
          [
            tenantsSheet(beta, {
              ...beta,
              name: "Chai Point",
              state: "Atlantis",
            }),
            leasesSheet(
              betaLease,
              // Unit 101 is the seeded lease's until 31-03-2029
              { ...betaLease, units: "101", start: "01-01-2027" },
              // Its tenant's row failed: not reported again
              { ...betaLease, tenant: "Chai Point" },
            ),
          ],
          "2026-10-23",
        ),
      );
      await expect(attempt).rejects.toBeInstanceOf(ImportRefused);
      const errors = await attempt.catch((e: ImportRefused) => e.errors);
      expect(errors).toEqual([
        {
          sheet: "Leases",
          row: 3,
          message:
            "Units: Unit 101 is already leased from 01-04-2026 to 31-03-2029. Choose other units or change the dates.",
        },
        {
          sheet: "Tenants",
          row: 3,
          message:
            '"Atlantis" isn\'t an Indian state. Type its name, like Maharashtra, or its GST code, like 27.',
        },
      ]);
    }));

  it("refuses a lease whose rent today doesn't match its increases", () =>
    inRollback(async (tx) => {
      const { ctx } = await withUnit102(tx);
      // Typed today's ₹1,20,000 as the rent at start of a lease from
      // 01-04-2025: with 5% from 01-04-2026 it would bill ₹1,26,000.
      const attempt = runScoped(asDb(tx), ctx, (s) =>
        importTenancy(
          s,
          [
            tenantsSheet(beta),
            leasesSheet({
              ...betaLease,
              start: "01-04-2025",
              rentToday: "1,20,000",
            }),
          ],
          "2026-10-23",
        ),
      );
      await expect(attempt).rejects.toBeInstanceOf(ImportRefused);
      const errors = await attempt.catch((e: ImportRefused) => e.errors);
      expect(errors).toEqual([
        {
          sheet: "Leases",
          row: 2,
          message:
            "Rent today (₹): the rent at lease start with its increases comes to ₹1,26,000 a month today, not ₹1,20,000. Type the rent from the lease's first month under Rent at lease start.",
        },
      ]);
    }));
});
