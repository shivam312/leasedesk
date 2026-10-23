import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  actAs,
  closeDb,
  skipDbTests,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { issueCreditNote } from "@/lib/invoices/credit-notes";
import { issueInvoice } from "@/lib/invoices/send";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import {
  applyCredit,
  paymentsWithCredit,
  PaymentError,
  paymentSettings,
  recordPayment,
  reversePayment,
  unpaidInvoices,
  type RecordPayment,
} from "../payments";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

// November 2026: ₹1,17,000 rent + ₹21,060 GST = ₹1,38,060, expected TDS
// 10% of ₹1,17,000 = ₹11,700, so the tenant pays ₹1,26,360.
async function sentInvoice(tx: TestTx) {
  const { a, ctx, invoice, line } = await madeDraft(tx);
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  return { a, ctx, invoice, line };
}

const status = async (tx: TestTx, id: string) =>
  (
    await tx
      .select({ status: schema.invoices.status })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id))
  )[0]?.status;

describe.skipIf(skipDbTests)("payments", () => {
  afterAll(closeDb);

  const pay = (over: Partial<RecordPayment> & { tenantId: string }) => ({
    receivedDate: "2026-11-10",
    amountReceivedPaise: 12_636_000,
    tdsPaise: 1_170_000,
    mode: "neft" as const,
    reference: "UTR123",
    note: null,
    allocations: "auto" as const,
    ...over,
  });

  it("counts a payment 50 paise short, with TDS, as paid (tds.tolerancePaise ₹1)", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      // ₹1,26,359.50 received + ₹11,700 TDS = ₹1,38,059.50 of ₹1,38,060.
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          pay({ tenantId: a.tenant.id, amountReceivedPaise: 12_635_950 }),
          "2026-11-10",
        ),
      );
      expect(await status(tx, invoice.id)).toBe("paid");
      const open = await runScoped(asDb(tx), ctx, async (s) =>
        unpaidInvoices(s, a.tenant.id, await paymentSettings(s, a.tenant.id)),
      );
      expect(open).toEqual([]);
    });
  });

  it("records a payment with TDS: invoice paid, TDS record in Q3", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      const open = await runScoped(asDb(tx), ctx, async (s) =>
        unpaidInvoices(s, a.tenant.id, await paymentSettings(s, a.tenant.id)),
      );
      expect(open).toMatchObject([
        {
          id: invoice.id,
          outstandingPaise: 13_806_000,
          expectedTdsPaise: 1_170_000,
        },
      ]);
      const { payment, allocations } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(s, pay({ tenantId: a.tenant.id }), "2026-11-10"),
      );
      // 1,26,360 + 11,700 = 1,38,060 applied to November
      expect(allocations).toEqual([
        { invoiceId: invoice.id, amountPaise: 13_806_000 },
      ]);
      expect(await status(tx, invoice.id)).toBe("paid");
      const tds = await tx
        .select()
        .from(schema.tdsRecords)
        .where(eq(schema.tdsRecords.paymentId, payment.id));
      expect(tds).toMatchObject([
        { amount: 1_170_000, financialYear: "2026-27", quarter: 3 },
      ]);
      const log = await tx
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.entityId, payment.id));
      expect(log.map((l) => l.action)).toContain("create");
    });
  });

  it("part pays, then the rest; refuses applying more than is unpaid", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          pay({
            tenantId: a.tenant.id,
            amountReceivedPaise: 5_000_000,
            tdsPaise: 0,
          }),
          "2026-11-10",
        ),
      );
      expect(await status(tx, invoice.id)).toBe("part_paid");
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          recordPayment(
            s,
            pay({
              tenantId: a.tenant.id,
              tdsPaise: 0,
              allocations: [{ invoiceId: invoice.id, amountPaise: 8_806_001 }],
              amountReceivedPaise: 9_000_000,
            }),
            "2026-11-10",
          ),
        ),
      ).rejects.toThrow("has only ₹88,060 left to pay");
      // 50,000 paid; 88,060 left: 76,360 + 11,700 TDS
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          pay({ tenantId: a.tenant.id, amountReceivedPaise: 7_636_000 }),
          "2026-11-12",
        ),
      );
      expect(await status(tx, invoice.id)).toBe("paid");
    });
  });

  it("keeps an overpayment as credit and applies it to the next invoice", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      // 1,40,000 received, no TDS: ₹1,940 more than the ₹1,38,060 owed
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          pay({
            tenantId: a.tenant.id,
            amountReceivedPaise: 14_000_000,
            tdsPaise: 0,
          }),
          "2026-11-10",
        ),
      );
      expect(await status(tx, invoice.id)).toBe("paid");
      const credit = await runScoped(asDb(tx), ctx, (s) =>
        paymentsWithCredit(s, a.tenant.id),
      );
      expect(credit.map((c) => c.creditPaise)).toEqual([194_000]);
      // Nothing else unpaid yet: nothing applied
      expect(
        await runScoped(asDb(tx), ctx, (s) => applyCredit(s, a.tenant.id)),
      ).toBe(0);
    });
  });

  it("keeps a payment applied to nothing as credit, with an invoice unpaid", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      // The form with every invoice set to 0 sends no allocations (not
      // "auto"): ₹50,000 received, no TDS, all ₹50,000 kept as credit and
      // the ₹1,38,060 invoice left untouched until "Apply credit".
      const { allocations } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          pay({
            tenantId: a.tenant.id,
            amountReceivedPaise: 5_000_000,
            tdsPaise: 0,
            allocations: [],
          }),
          "2026-11-10",
        ),
      );
      expect(allocations).toEqual([]);
      expect(await status(tx, invoice.id)).toBe("sent");
      const credit = await runScoped(asDb(tx), ctx, (s) =>
        paymentsWithCredit(s, a.tenant.id),
      );
      expect(credit.map((c) => c.creditPaise)).toEqual([5_000_000]);
    });
  });

  it("reverses a payment: invoice unpaid again, TDS stops counting", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      const { payment } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(s, pay({ tenantId: a.tenant.id }), "2026-11-10"),
      );
      const reversal = await runScoped(asDb(tx), ctx, (s) =>
        reversePayment(s, payment.id, "2026-11-11", "Wrong tenant"),
      );
      expect(reversal).toMatchObject({
        kind: "reversal",
        amountReceived: -12_636_000,
        tdsDeducted: -1_170_000,
      });
      expect(await status(tx, invoice.id)).toBe("sent");
      const open = await runScoped(asDb(tx), ctx, async (s) =>
        unpaidInvoices(s, a.tenant.id, await paymentSettings(s, a.tenant.id)),
      );
      expect(open[0]).toMatchObject({
        outstandingPaise: 13_806_000,
        expectedTdsPaise: 1_170_000,
      });
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          reversePayment(s, payment.id, "2026-11-11", "again"),
        ),
      ).rejects.toBeInstanceOf(PaymentError);
    });
  });

  it("expects less TDS after a credit note (D-017)", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, line } = await sentInvoice(tx);
      // Credit ₹58,500 of the ₹1,17,000 rent: TDS 10% of ₹58,500 left = ₹5,850
      await runScoped(asDb(tx), ctx, (s) =>
        issueCreditNote(s, {
          invoiceId: invoice.id,
          date: "2026-11-05",
          reason: "waiver",
          note: null,
          lines: [{ lineId: line.id, taxablePaise: 5_850_000 }],
        }),
      );
      const open = await runScoped(asDb(tx), ctx, async (s) =>
        unpaidInvoices(s, a.tenant.id, await paymentSettings(s, a.tenant.id)),
      );
      // ₹1,38,060 − (₹58,500 + ₹10,530 GST) = ₹69,030 left
      expect(open[0]).toMatchObject({
        outstandingPaise: 6_903_000,
        expectedTdsPaise: 585_000,
      });
    });
  });

  it("a credit note can't take off money a payment already settled (D-019)", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, line } = await sentInvoice(tx);
      // ₹1,00,000 paid, no TDS: ₹38,060 of the ₹1,38,060 is still unpaid
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          pay({
            tenantId: a.tenant.id,
            amountReceivedPaise: 10_000_000,
            tdsPaise: 0,
          }),
          "2026-11-10",
        ),
      );
      const credit = (taxablePaise: number) =>
        runScoped(asDb(tx), ctx, (s) =>
          issueCreditNote(s, {
            invoiceId: invoice.id,
            date: "2026-11-20",
            reason: "waiver",
            note: null,
            lines: [{ lineId: line.id, taxablePaise }],
          }),
        );
      // ₹40,000 + 18% GST = ₹47,200 > ₹38,060 unpaid
      await expect(credit(4_000_000)).rejects.toThrow(
        "can take off at most ₹38,060",
      );
      // ₹30,000 + ₹5,400 GST = ₹35,400 ≤ ₹38,060: allowed, still part paid
      await credit(3_000_000);
      expect(await status(tx, invoice.id)).toBe("part_paid");
    });
  });

  it("the database refuses edits and deletes of payments and allocations", async () => {
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      const { payment } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(s, pay({ tenantId: a.tenant.id }), "2026-11-10"),
      );
      await tx.execute(sql`reset role`);
      await expect(
        tx
          .update(schema.payments)
          .set({ amountReceived: 1 })
          .where(eq(schema.payments.id, payment.id)),
      ).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      const { payment } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(s, pay({ tenantId: a.tenant.id }), "2026-11-10"),
      );
      // As the database owner, past row-level security: the trigger refuses.
      await tx.execute(sql`reset role`);
      await expect(
        tx.delete(schema.payments).where(eq(schema.payments.id, payment.id)),
      ).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      const { payment } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(s, pay({ tenantId: a.tenant.id }), "2026-11-10"),
      );
      await tx.execute(sql`reset role`);
      await expect(
        tx
          .delete(schema.paymentAllocations)
          .where(eq(schema.paymentAllocations.paymentId, payment.id)),
      ).rejects.toThrow();
    });
  });

  it("another organization can't see or add payments", async () => {
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      await tx.execute(sql`reset role`);
      const b = await seedOrg(tx, "B");
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(s, pay({ tenantId: a.tenant.id }), "2026-11-10"),
      );
      await actAs(tx, b.userId);
      expect(await tx.select().from(schema.payments)).toHaveLength(0);
      expect(await tx.select().from(schema.tdsRecords)).toHaveLength(0);
      await expect(
        tx.insert(schema.payments).values({
          organizationId: a.org.id,
          tenantId: a.tenant.id,
          receivedDate: "2026-11-10",
          amountReceived: 100,
          mode: "cash",
        }),
      ).rejects.toThrow();
    });
  });

  it("a property manager can't record payments", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "PM", "property_manager");
      await actAs(tx, a.userId);
      await expect(
        tx.insert(schema.payments).values({
          organizationId: a.org.id,
          tenantId: a.tenant.id,
          receivedDate: "2026-11-10",
          amountReceived: 100,
          mode: "cash",
        }),
      ).rejects.toThrow();
    });
  });
});
