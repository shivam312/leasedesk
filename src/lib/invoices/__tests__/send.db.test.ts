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
import { issueInvoice, SendError } from "../send";

const ready = await hasTables("invoices", "invoice_series");
const asDb = (tx: TestTx) => tx as unknown as Transactional;
const SENT_AT = new Date("2026-11-01T04:30:00Z");

async function withGstin(tx: TestTx, gstin: string | null = "27AAPFU0939F1ZV") {
  const a = await seedOrg(tx, "A");
  await tx
    .update(schema.billingEntities)
    .set({ gstin })
    .where(eq(schema.billingEntities.id, a.entity.id));
  return a;
}

describe.skipIf(!ready)("issueInvoice (skipped until pnpm db:migrate)", () => {
  afterAll(closeDb);

  it("numbers a draft, copies the details onto it and marks it sent, once", async () => {
    await inRollback(async (tx) => {
      const a = await withGstin(tx);
      const { invoice } = await draftInvoice(tx, a);
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const issue = () =>
        runScoped(asDb(tx), ctx, (s) => issueInvoice(s, invoice.id, SENT_AT));
      const first = await issue();
      expect(first).toMatchObject({ kind: "issued", number: "T/26-27/0001" });
      expect(await issue()).toEqual({ kind: "not_draft" });
      const [row] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id));
      expect(row).toMatchObject({
        status: "sent",
        number: "T/26-27/0001",
        sentAt: SENT_AT,
        supplier: { legalName: "A", gstin: "27AAPFU0939F1ZV" },
        recipient: { property: "A Tower, Andheri, Mumbai · Unit 101" },
      });
      const sends = await tx
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.action, "send"));
      expect(sends).toHaveLength(1);
    });
  });

  it("refuses without a GSTIN and gives the number back", async () => {
    await inRollback(async (tx) => {
      const a = await withGstin(tx, null);
      const { invoice } = await draftInvoice(tx, a);
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await expect(
        runScoped(asDb(tx), ctx, (s) => issueInvoice(s, invoice.id, SENT_AT)),
      ).rejects.toBeInstanceOf(SendError);
      expect(await tx.select().from(schema.invoiceSeries)).toHaveLength(0);
    });
  });
});
