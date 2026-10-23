import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  actAs,
  closeDb,
  hasTables,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { memoryStore } from "@/lib/files/store";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import { recordPayment } from "@/lib/payments/payments";
import {
  attachCertificate,
  CertificateError,
  trackerRecords,
} from "../certificates";
import { tdsTracker } from "../tracker";

const ready = await hasTables("documents", "tds_records");
const asDb = (tx: TestTx) => tx as unknown as Transactional;
const pdf = new TextEncoder().encode("%PDF-1.4 test");

// November 2026: ₹1,26,360 received + ₹11,700 TDS on 10 Nov → Q3 FY 2026-27
async function paidWithTds(tx: TestTx) {
  const { a, ctx, invoice } = await madeDraft(tx);
  await runScoped(asDb(tx), ctx, async (s) => {
    await issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z"));
    await recordPayment(
      s,
      {
        tenantId: a.tenant.id,
        receivedDate: "2026-11-10",
        amountReceivedPaise: 12_636_000,
        tdsPaise: 1_170_000,
        mode: "neft",
        reference: null,
        note: null,
        allocations: "auto",
      },
      "2026-11-10",
    );
  });
  return { a, ctx };
}

describe.skipIf(!ready)(
  "TDS certificates (skipped until pnpm db:migrate)",
  () => {
    afterAll(closeDb);

    it("tracks TDS by quarter, then marks it received with the certificate", async () => {
      await inRollback(async (tx) => {
        const { a, ctx } = await paidWithTds(tx);
        const before = await runScoped(asDb(tx), ctx, (s) =>
          trackerRecords(s, "2026-27"),
        );
        expect(
          tdsTracker({
            financialYear: "2026-27",
            today: "2027-03-01",
            records: before,
          }).rows[0]!.quarters[2],
        ).toMatchObject({
          amount: 1_170_000,
          status: "pending",
          overdue: true,
        });

        const store = memoryStore();
        const { document, records } = await runScoped(asDb(tx), ctx, (s) =>
          attachCertificate(s, store, {
            tenantId: a.tenant.id,
            financialYear: "2026-27",
            quarter: 3,
            fileName: "16A-Q3.pdf",
            contentType: "application/pdf",
            bytes: pdf,
          }),
        );
        expect(records).toBe(1);
        expect(document.filePath.startsWith(`${a.org.id}/tds/`)).toBe(true);
        expect(store.files.get(document.filePath)?.bytes).toEqual(pdf);
        const after = await runScoped(asDb(tx), ctx, (s) =>
          trackerRecords(s, "2026-27"),
        );
        expect(
          tdsTracker({
            financialYear: "2026-27",
            today: "2027-03-01",
            records: after,
          }).rows[0]!.quarters[2],
        ).toMatchObject({ status: "received", documentIds: [document.id] });
      });
    });

    it("refuses a quarter with no TDS, or a file that isn't a PDF or image", async () => {
      await inRollback(async (tx) => {
        const { a, ctx } = await paidWithTds(tx);
        const attach = (quarter: 1 | 3, contentType: string) =>
          runScoped(asDb(tx), ctx, (s) =>
            attachCertificate(s, memoryStore(), {
              tenantId: a.tenant.id,
              financialYear: "2026-27",
              quarter,
              fileName: "x",
              contentType,
              bytes: pdf,
            }),
          );
        await expect(attach(1, "application/pdf")).rejects.toThrow(
          "There's no TDS waiting for a certificate from A Tenant in Q1 of FY 2026-27.",
        );
        // Not a PDF inside, whatever the browser says it is
        await expect(
          runScoped(asDb(tx), ctx, (s) =>
            attachCertificate(s, memoryStore(), {
              tenantId: a.tenant.id,
              financialYear: "2026-27",
              quarter: 3,
              fileName: "x.pdf",
              contentType: "application/pdf",
              bytes: new TextEncoder().encode("<html>"),
            }),
          ),
        ).rejects.toBeInstanceOf(CertificateError);
      });
    });

    it("a second upload for the quarter doesn't replace the first certificate", async () => {
      await inRollback(async (tx) => {
        const { a, ctx } = await paidWithTds(tx);
        const attach = () =>
          runScoped(asDb(tx), ctx, (s) =>
            attachCertificate(s, memoryStore(), {
              tenantId: a.tenant.id,
              financialYear: "2026-27",
              quarter: 3,
              fileName: "16A.pdf",
              contentType: "application/pdf",
              bytes: pdf,
            }),
          );
        const first = await attach();
        await expect(attach()).rejects.toThrow(/no TDS waiting/);
        const [r] = await tx
          .select()
          .from(schema.tdsRecords)
          .where(eq(schema.tdsRecords.tenantId, a.tenant.id));
        expect(r?.certificateDocumentId).toBe(first.document.id);
      });
    });

    it("only the certificate columns of a TDS record can change", async () => {
      await inRollback(async (tx) => {
        await paidWithTds(tx);
        await tx.execute(sql`reset role`);
        await expect(
          tx.update(schema.tdsRecords).set({ amount: 1 }),
        ).rejects.toThrow();
      });
    });

    it("another organization can't see the documents", async () => {
      await inRollback(async (tx) => {
        const { a, ctx } = await paidWithTds(tx);
        await runScoped(asDb(tx), ctx, (s) =>
          attachCertificate(s, memoryStore(), {
            tenantId: a.tenant.id,
            financialYear: "2026-27",
            quarter: 3,
            fileName: "16A.pdf",
            contentType: "application/pdf",
            bytes: pdf,
          }),
        );
        await tx.execute(sql`reset role`);
        const b = await seedOrg(tx, "B");
        await actAs(tx, b.userId);
        expect(await tx.select().from(schema.documents)).toHaveLength(0);
        expect(
          await tx
            .select()
            .from(schema.tdsRecords)
            .where(eq(schema.tdsRecords.tenantId, a.tenant.id)),
        ).toHaveLength(0);
      });
    });
  },
);
