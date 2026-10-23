import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { draftInvoice, seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  skipDbTests,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { draftTenantsWithoutEmail, issueInvoice, SendError } from "../send";
import { madeDraft } from "./db-fixtures";

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

describe.skipIf(skipDbTests)("issueInvoice", () => {
  afterAll(closeDb);

  it("numbers a draft, copies the details onto it and marks it sent, once", async () => {
    await inRollback(async (tx) => {
      const { ctx, invoice } = await madeDraft(tx);
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
        grandTotal: 13_806_000,
        recipient: { property: "A Tower, Andheri, Mumbai · Unit 101" },
      });
      const sends = await tx
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.action, "send"));
      expect(sends).toHaveLength(1);
    });
  });

  it("refuses a draft whose lease changed after it was made, and takes no number", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await madeDraft(tx);
      // Ended 20 Nov: November is now ₹1,17,000 × 20/30 = ₹78,000, not the
      // ₹1,17,000 on the draft.
      await tx
        .update(schema.leases)
        .set({ endDate: "2026-11-20" })
        .where(eq(schema.leases.id, a.lease.id));
      await expect(
        runScoped(asDb(tx), ctx, (s) => issueInvoice(s, invoice.id, SENT_AT)),
      ).rejects.toThrow(/changed after this invoice was made/);
      expect(
        await tx
          .select()
          .from(schema.invoiceSeries)
          .where(eq(schema.invoiceSeries.organizationId, ctx.organizationId)),
      ).toHaveLength(0);
    });
  });

  it("treats a draft replaced by making the month again as not a draft", async () => {
    await inRollback(async (tx) => {
      const { ctx } = await madeDraft(tx);
      expect(
        await runScoped(asDb(tx), ctx, (s) =>
          issueInvoice(s, "00000000-0000-4000-8000-000000000000", SENT_AT),
        ),
      ).toEqual({ kind: "not_draft" });
    });
  });

  it("refuses to send before the invoice date, and takes no number", async () => {
    await inRollback(async (tx) => {
      const { ctx, invoice } = await madeDraft(tx);
      // 25 Oct 2026 in India; the November invoice is dated 01-11-2026.
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          issueInvoice(s, invoice.id, new Date("2026-10-25T06:00:00Z")),
        ),
      ).rejects.toThrow(/can be sent from that day/);
      expect(
        await tx
          .select()
          .from(schema.invoiceSeries)
          .where(eq(schema.invoiceSeries.organizationId, ctx.organizationId)),
      ).toHaveLength(0);
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
      expect(
        await tx
          .select()
          .from(schema.invoiceSeries)
          .where(eq(schema.invoiceSeries.organizationId, ctx.organizationId)),
      ).toHaveLength(0);
    });
  });
});

describe.skipIf(skipDbTests)("draftTenantsWithoutEmail", () => {
  afterAll(closeDb);

  it("names a draft's tenant until it has an email address", async () => {
    await inRollback(async (tx) => {
      const a = await withGstin(tx);
      await draftInvoice(tx, a);
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const names = () =>
        runScoped(asDb(tx), ctx, (s) => draftTenantsWithoutEmail(s, "2026-11"));
      expect(await names()).toEqual(["A Tenant"]);
      expect(
        await runScoped(asDb(tx), ctx, (s) =>
          draftTenantsWithoutEmail(s, "2026-12"),
        ),
      ).toEqual([]);
      await tx
        .update(schema.tenantContacts)
        .set({ email: "accounts@a.test" })
        .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
      expect(await names()).toEqual([]);
    });
  });
});
