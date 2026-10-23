import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { draftInvoice, seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  hasTables,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { issueCreditNote } from "../credit-notes";
import { issueInvoice, SendError } from "../send";

const ready = await hasTables("credit_notes", "credit_note_lines");
const asDb = (tx: TestTx) => tx as unknown as Transactional;

async function sentInvoice(tx: TestTx) {
  const a = await seedOrg(tx, "A");
  await tx
    .update(schema.billingEntities)
    .set({ gstin: "27AAPFU0939F1ZV" })
    .where(eq(schema.billingEntities.id, a.entity.id));
  const { invoice, line } = await draftInvoice(tx, a);
  const ctx = { userId: a.userId, organizationId: a.org.id };
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  return { a, ctx, invoice, line };
}

describe.skipIf(!ready)(
  "issueCreditNote (skipped until pnpm db:migrate)",
  () => {
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
        // ₹400 of the ₹1,000 rent: GST 9% + 9% of ₹400 = ₹36 + ₹36; ₹472.
        const first = await credit(40000);
        expect(first).toMatchObject({
          number: "TCN/26-27/0001",
          taxableAmount: 40000,
          cgst: 3600,
          sgst: 3600,
          total: 47200,
        });
        // The remaining ₹600 with ₹54 + ₹54 as charged: ₹708.
        const second = await credit(60000);
        expect(second).toMatchObject({
          number: "TCN/26-27/0002",
          cgst: 5400,
          sgst: 5400,
          total: 70800,
        });
        const [row] = await tx
          .select({ status: schema.invoices.status })
          .from(schema.invoices)
          .where(eq(schema.invoices.id, invoice.id));
        expect(row?.status).toBe("cancelled");
        await expect(credit(100)).rejects.toBeInstanceOf(SendError);
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
              lines: [{ lineId: line.id, taxablePaise: 100001 }],
            }),
          ),
        ).rejects.toThrow(/₹1,000/);
        const cn = await tx
          .select()
          .from(schema.invoiceSeries)
          .where(eq(schema.invoiceSeries.kind, "credit_note"));
        expect(cn).toHaveLength(0);
      });
    });
  },
);
