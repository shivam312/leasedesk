import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  closeDb,
  skipDbTests,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { openInvoiceRows } from "@/lib/alerts/queries";
import { issueInvoice } from "@/lib/invoices/send";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { ledgerFor } from "../ledger";
import {
  openingBalanceFor,
  removeOpeningBalance,
  setOpeningBalance,
} from "../opening-balances";
import {
  PaymentError,
  paymentSettings,
  recordPayment,
  reversePayment,
  unpaidInvoices,
} from "../payments";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

// The November 2026 invoice of ₹1,38,060 (₹1,17,000 rent + ₹21,060 GST,
// expected TDS ₹11,700), and an opening balance of ₹2,00,000 as on
// 30-09-2026 from the landlord's old Excel.
async function setUp(tx: TestTx) {
  const { a, ctx, invoice } = await madeDraft(tx);
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  const opening = await runScoped(asDb(tx), ctx, (s) =>
    setOpeningBalance(
      s,
      {
        tenantId: a.tenant.id,
        asOnDate: "2026-09-30",
        amountPaise: 20_000_000,
        note: "From the old Excel",
      },
      "2026-11-10",
    ),
  );
  return { a, ctx, invoice, opening };
}

describe.skipIf(skipDbTests)("opening balances", () => {
  afterAll(closeDb);

  it("is owed first: the ledger's first row, unpaid before the invoice, on Today and ageing", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, opening } = await setUp(tx);
      await runScoped(asDb(tx), ctx, async (s) => {
        const ledger = await ledgerFor(s, a.tenant.id);
        // ₹2,00,000 then + ₹1,38,060 = ₹3,38,060.
        expect(ledger.entries.map((e) => [e.kind, e.balancePaise])).toEqual([
          ["opening_balance", 20_000_000],
          ["invoice", 33_806_000],
        ]);
        const open = await unpaidInvoices(
          s,
          a.tenant.id,
          await paymentSettings(s, a.tenant.id),
        );
        expect(
          open.map((o) => [o.id, o.outstandingPaise, o.expectedTdsPaise]),
        ).toEqual([
          [opening.id, 20_000_000, 0],
          [invoice.id, 13_806_000, 1_170_000],
        ]);
        const rows = await openInvoiceRows(s);
        expect(rows.find((r) => r.id === opening.id)).toMatchObject({
          openingBalance: true,
          dueDate: "2026-09-30",
        });
      });
    });
  });

  it("is settled by a payment, oldest first, then locked; a reversal puts it back", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, opening } = await setUp(tx);
      // ₹2,50,000 received, no TDS: ₹2,00,000 clears the opening balance,
      // ₹50,000 goes on November's invoice (₹88,060 left).
      const { payment } = await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-10",
            amountReceivedPaise: 25_000_000,
            tdsPaise: 0,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-10",
        ),
      );
      const allocations = await tx
        .select()
        .from(schema.paymentAllocations)
        .where(eq(schema.paymentAllocations.paymentId, payment.id));
      expect(
        allocations
          .map((x) => [x.openingBalanceId ?? x.invoiceId, x.amountSettled])
          .sort(),
      ).toEqual(
        [
          [opening.id, 20_000_000],
          [invoice.id, 5_000_000],
        ].sort(),
      );
      await runScoped(asDb(tx), ctx, async (s) => {
        const open = await unpaidInvoices(
          s,
          a.tenant.id,
          await paymentSettings(s, a.tenant.id),
        );
        expect(open.map((o) => [o.id, o.outstandingPaise])).toEqual([
          [invoice.id, 8_806_000],
        ]);
        expect((await openingBalanceFor(s, a.tenant.id))?.locked).toBe(true);
        await expect(
          setOpeningBalance(
            s,
            {
              tenantId: a.tenant.id,
              asOnDate: "2026-09-30",
              amountPaise: 1_00,
              note: null,
            },
            "2026-11-10",
          ),
        ).rejects.toBeInstanceOf(PaymentError);
        await expect(
          removeOpeningBalance(s, a.tenant.id),
        ).rejects.toBeInstanceOf(PaymentError);
        await reversePayment(s, payment.id, "2026-11-11", "Bounced");
        const after = await unpaidInvoices(
          s,
          a.tenant.id,
          await paymentSettings(s, a.tenant.id),
        );
        expect(after.map((o) => [o.id, o.outstandingPaise])).toEqual([
          [opening.id, 20_000_000],
          [invoice.id, 13_806_000],
        ]);
      });
    });
  });

  it("can be changed or removed until a payment touches it, and is logged", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, opening } = await setUp(tx);
      await runScoped(asDb(tx), ctx, async (s) => {
        await setOpeningBalance(
          s,
          {
            tenantId: a.tenant.id,
            asOnDate: "2026-10-31",
            amountPaise: 15_000_000,
            note: null,
          },
          "2026-11-10",
        );
        const changed = await openingBalanceFor(s, a.tenant.id);
        expect(changed).toMatchObject({
          id: opening.id,
          amount: 15_000_000,
          asOnDate: "2026-10-31",
          locked: false,
        });
        await expect(
          setOpeningBalance(
            s,
            {
              tenantId: a.tenant.id,
              asOnDate: "2026-12-01",
              amountPaise: 1,
              note: null,
            },
            "2026-11-10",
          ),
        ).rejects.toThrow(/after today/);
        await removeOpeningBalance(s, a.tenant.id);
        expect(await openingBalanceFor(s, a.tenant.id)).toBeNull();
      });
      const log = await tx
        .select({ action: schema.activityLog.action })
        .from(schema.activityLog)
        .where(eq(schema.activityLog.entityId, opening.id));
      expect(log.map((l) => l.action).sort()).toEqual(
        ["create", "delete", "update"].sort(),
      );
    });
  });

  it("can be corrected once the payment applied to it is reversed, but not removed", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, opening } = await setUp(tx);
      // ₹2,00,000 typed instead of ₹20,000; a ₹20,000 payment lands on it.
      await runScoped(asDb(tx), ctx, async (s) => {
        const { payment } = await recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-10",
            amountReceivedPaise: 2_000_000,
            tdsPaise: 0,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-10",
        );
        expect((await openingBalanceFor(s, a.tenant.id))?.locked).toBe(true);
        await reversePayment(s, payment.id, "2026-11-11", "Wrong balance");
        // Nothing is applied to it any more (+₹20,000 − ₹20,000), so the
        // amount can be put right, as the locked message promises.
        expect((await openingBalanceFor(s, a.tenant.id))?.locked).toBe(false);
        await setOpeningBalance(
          s,
          {
            tenantId: a.tenant.id,
            asOnDate: "2026-09-30",
            amountPaise: 2_000_000,
            note: null,
          },
          "2026-11-11",
        );
        expect((await openingBalanceFor(s, a.tenant.id))?.amount).toBe(
          2_000_000,
        );
        // The payment and its reversal still point at it, so it stays.
        await expect(
          removeOpeningBalance(s, a.tenant.id),
        ).rejects.toBeInstanceOf(PaymentError);
      });
      // The database agrees: changing it is allowed, removing it isn't.
      await tx
        .update(schema.openingBalances)
        .set({ note: "Corrected" })
        .where(eq(schema.openingBalances.id, opening.id));
      await expect(
        tx
          .delete(schema.openingBalances)
          .where(eq(schema.openingBalances.id, opening.id)),
      ).rejects.toThrow();
    });
  });

  it("is refused by the database once a payment touches it, whatever the app does", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, opening } = await setUp(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-10",
            amountReceivedPaise: 1_000_000,
            tdsPaise: 0,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-10",
        ),
      );
      await expect(
        tx
          .update(schema.openingBalances)
          .set({ amount: 1 })
          .where(eq(schema.openingBalances.id, opening.id)),
      ).rejects.toThrow();
    });
  });
});
