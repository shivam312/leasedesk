import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  skipDbTests,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { issueCreditNote } from "../credit-notes";
import { leasesWithoutInvoice, runBilling } from "../run";
import { issueInvoice } from "../send";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

async function billableOrg(
  tx: TestTx,
  gstin: string | null = "27AAPFU0939F1ZV",
) {
  const a = await seedOrg(tx, "A");
  await tx
    .update(schema.billingEntities)
    .set({ gstin })
    .where(eq(schema.billingEntities.id, a.entity.id));
  await tx
    .update(schema.leases)
    .set({ status: "active" })
    .where(eq(schema.leases.id, a.lease.id));
  return a;
}

describe.skipIf(skipDbTests)("monthly billing run", () => {
  afterAll(closeDb);

  it("drafts an invoice for an active lease, and replaces it on a second run", async () => {
    await inRollback(async (tx) => {
      const a = await billableOrg(tx);
      const run = () =>
        runScoped(
          asDb(tx),
          { userId: a.userId, organizationId: a.org.id },
          (s) => runBilling(s, "2026-11"),
        );
      expect(await run()).toMatchObject({ drafted: 1, problems: [] });
      expect(await run()).toMatchObject({ drafted: 1, problems: [] });
      const rows = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.organizationId, a.org.id));
      expect(rows).toHaveLength(1);
      // 1,300 sq ft × ₹90 = ₹1,17,000; CGST and SGST 9% = ₹10,530 each;
      // total ₹1,38,060; TDS 10% = ₹11,700.
      expect(rows[0]).toMatchObject({
        status: "draft",
        number: null,
        invoiceDate: "2026-11-01",
        dueDate: "2026-11-08",
        supplyType: "intra_state",
        taxableTotal: 11_700_000,
        cgstTotal: 1_053_000,
        sgstTotal: 1_053_000,
        grandTotal: 13_806_000,
        expectedTds: 1_170_000,
      });
      const lines = await tx
        .select()
        .from(schema.invoiceLines)
        .where(eq(schema.invoiceLines.organizationId, a.org.id));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        description: "Rent for Nov 2026",
        quantityLabel: "1,300 sq ft",
        position: 1,
      });
    });
  });

  it("counts leases with no invoice for the month, so only those make 'missing' invoices", async () => {
    await inRollback(async (tx) => {
      const a = await billableOrg(tx);
      const scoped = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
        runScoped(asDb(tx), { userId: a.userId, organizationId: a.org.id }, fn);
      // Before the run, the one active lease has nothing for November.
      expect(await scoped((s) => leasesWithoutInvoice(s, "2026-11"))).toBe(1);
      await scoped((s) => runBilling(s, "2026-11"));
      // A draft counts as made; once sent, it still does.
      expect(await scoped((s) => leasesWithoutInvoice(s, "2026-11"))).toBe(0);
    });
  });

  it("removes the month's draft for a lease ended before that month", async () => {
    await inRollback(async (tx) => {
      const a = await billableOrg(tx);
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await runScoped(asDb(tx), ctx, (s) => runBilling(s, "2026-11"));
      // Ended early, backdated to 30 Jun 2026 (D21 changes only the end date).
      await tx
        .update(schema.leases)
        .set({ endDate: "2026-06-30", status: "terminated" })
        .where(eq(schema.leases.id, a.lease.id));
      expect(
        await runScoped(asDb(tx), ctx, (s) => runBilling(s, "2026-11")),
      ).toMatchObject({ drafted: 0 });
      expect(
        await tx
          .select()
          .from(schema.invoices)
          .where(eq(schema.invoices.organizationId, a.org.id)),
      ).toEqual([]);
    });
  });

  it("leaves a lease alone when the GSTIN is missing, and says so", async () => {
    await inRollback(async (tx) => {
      const a = await billableOrg(tx, null);
      const result = await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        (s) => runBilling(s, "2026-11"),
      );
      expect(result.drafted).toBe(0);
      expect(result.problems[0]?.message).toMatch(/Add the GSTIN/);
    });
  });

  it("bills nothing before the lease starts, and skips draft leases", async () => {
    await inRollback(async (tx) => {
      const a = await billableOrg(tx);
      const ctx = { userId: a.userId, organizationId: a.org.id };
      expect(
        await runScoped(asDb(tx), ctx, (s) => runBilling(s, "2026-03")),
      ).toMatchObject({ drafted: 0, nothingToBill: 0 });
      await tx
        .update(schema.leases)
        .set({ status: "draft" })
        .where(eq(schema.leases.id, a.lease.id));
      expect(
        await runScoped(asDb(tx), ctx, (s) => runBilling(s, "2026-11")),
      ).toMatchObject({ drafted: 0 });
    });
  });

  it("never bills a month again after its invoice was credited in full", async () => {
    await inRollback(async (tx) => {
      const a = await billableOrg(tx);
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const run = () =>
        runScoped(asDb(tx), ctx, (s) => runBilling(s, "2026-11"));
      await run();
      const [draft] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.organizationId, a.org.id));
      await runScoped(asDb(tx), ctx, (s) =>
        issueInvoice(s, draft!.id, new Date("2026-11-01T04:30:00Z")),
      );
      const lines = await tx
        .select()
        .from(schema.invoiceLines)
        .where(eq(schema.invoiceLines.invoiceId, draft!.id));
      await runScoped(asDb(tx), ctx, (s) =>
        issueCreditNote(s, {
          invoiceId: draft!.id,
          date: "2026-11-05",
          reason: "waiver",
          note: null,
          lines: lines.map((l) => ({
            lineId: l.id,
            taxablePaise: l.taxableAmount,
          })),
        }),
      );
      expect(await run()).toMatchObject({ drafted: 0, alreadySent: 1 });
      expect(
        await tx
          .select()
          .from(schema.invoices)
          .where(eq(schema.invoices.organizationId, a.org.id)),
      ).toHaveLength(1);
    });
  });
});
