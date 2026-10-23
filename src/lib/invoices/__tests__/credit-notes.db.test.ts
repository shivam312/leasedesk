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
import { recordPayment } from "@/lib/payments/payments";
import { issueCreditNote } from "../credit-notes";
import { issueInvoice, SendError } from "../send";
import { madeDraft } from "./db-fixtures";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

async function sentInvoice(tx: TestTx) {
  const made = await madeDraft(tx);
  const { ctx, invoice, line } = made;
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  return { ...made, ctx, invoice, line };
}

describe.skipIf(skipDbTests)("issueCreditNote", () => {
  afterAll(closeDb);

  it("numbers a part credit, then the rest, and marks the invoice credited", async () => {
    await inRollback(async (tx) => {
      const { ctx, invoice, line } = await sentInvoice(tx);
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
      // ₹4,000 of the ₹1,17,000 rent: GST 9% + 9% of ₹4,000 = ₹360 +
      // ₹360; ₹4,720.
      const first = await credit(400_000);
      expect(first).toMatchObject({
        number: "TCN/26-27/0001",
        taxableAmount: 400_000,
        cgst: 36_000,
        sgst: 36_000,
        total: 472_000,
      });
      // The remaining ₹1,13,000 with the GST left as charged: ₹10,530 −
      // ₹360 = ₹10,170 each side; ₹1,13,000 + ₹20,340 = ₹1,33,340. The
      // invoice had no round off.
      const second = await credit(11_300_000);
      expect(second).toMatchObject({
        number: "TCN/26-27/0002",
        cgst: 1_017_000,
        sgst: 1_017_000,
        roundOff: 0,
        total: 13_334_000,
      });
      const [row] = await tx
        .select({ status: schema.invoices.status })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id));
      expect(row?.status).toBe("cancelled");
      await expect(credit(100)).rejects.toBeInstanceOf(SendError);
    });
  });

  it("marks a part-paid invoice paid when a credit note takes off the rest", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, line } = await sentInvoice(tx);
      // ₹1,38,060 invoice; ₹20,060 paid leaves ₹1,18,000.
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-10",
            amountReceivedPaise: 2_006_000,
            tdsPaise: 0,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-10",
        ),
      );
      // Credit ₹1,00,000 of the rent + 9% + 9% GST = ₹1,18,000: nothing
      // left to pay, though ₹17,000 of the rent line isn't credited.
      await runScoped(asDb(tx), ctx, (s) =>
        issueCreditNote(s, {
          invoiceId: invoice.id,
          date: "2026-11-20",
          reason: "waiver",
          note: null,
          lines: [{ lineId: line.id, taxablePaise: 10_000_000 }],
        }),
      );
      const [row] = await tx
        .select({ status: schema.invoices.status })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id));
      expect(row?.status).toBe("paid");
    });
  });

  it("refuses more than is left, and takes no number", async () => {
    await inRollback(async (tx) => {
      const { ctx, invoice, line } = await sentInvoice(tx);
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          issueCreditNote(s, {
            invoiceId: invoice.id,
            date: "2026-11-20",
            reason: "correction",
            note: null,
            lines: [{ lineId: line.id, taxablePaise: 11_700_001 }],
          }),
        ),
      ).rejects.toThrow(/₹1,17,000/);
      const cn = await tx
        .select()
        .from(schema.invoiceSeries)
        .where(eq(schema.invoiceSeries.kind, "credit_note"));
      expect(cn).toHaveLength(0);
    });
  });
});
