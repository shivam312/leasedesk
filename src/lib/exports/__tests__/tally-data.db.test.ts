import { eq, sql } from "drizzle-orm";
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
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import { recordPayment } from "@/lib/payments/payments";
import { saveSettings } from "@/lib/settings/store";
import { tallyXml } from "../tally";
import {
  earlierTallyExports,
  recordTallyExport,
  tallyExportData,
} from "../tally-data";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("Tally export data", () => {
  afterAll(closeDb);

  it("makes a sale and a receipt with the organization's ledger names, and warns on a second export", () =>
    inRollback(async (tx) => {
      // November 2026: ₹1,17,000 rent + ₹10,530 CGST + ₹10,530 SGST = ₹1,38,060
      const { a, ctx, invoice } = await madeDraft(tx);
      await runScoped(asDb(tx), ctx, async (s) => {
        await issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z"));
        await saveSettings(
          s,
          { scope: "organization" },
          {
            "tally.ledgerRent": "Rent Received",
            "tally.ledgerBank": "HDFC Bank",
          },
        );
        await saveSettings(
          s,
          { scope: "tenant", id: a.tenant.id },
          {
            "tally.partyLedger": "Acme (Debtors)",
          },
        );
        // ₹1,26,360 received + ₹11,700 TDS settles it
        await recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-15",
            amountReceivedPaise: 12_636_000,
            tdsPaise: 1_170_000,
            mode: "neft",
            reference: "UTR9",
            note: null,
            allocations: "auto",
          },
          "2026-11-15",
        );
      });
      const { vouchers, documentIds } = await runScoped(asDb(tx), ctx, (s) =>
        tallyExportData(s, "2026-11-01", "2026-11-30"),
      );
      expect(vouchers.map((v) => v.type)).toEqual(["Sales", "Receipt"]);
      const [sale, receipt] = vouchers;
      expect(sale!.entries).toEqual([
        expect.objectContaining({
          ledger: "Acme (Debtors)",
          amount: 13_806_000,
        }),
        { ledger: "Rent Received", amount: -11_700_000 },
        { ledger: "Output CGST", amount: -1_053_000 },
        { ledger: "Output SGST", amount: -1_053_000 },
      ]);
      expect(receipt!.entries.map((e) => [e.ledger, e.amount])).toEqual([
        ["HDFC Bank", 12_636_000],
        ["TDS Receivable", 1_170_000],
        ["Acme (Debtors)", -13_806_000],
      ]);
      expect(tallyXml(vouchers)).toContain(
        "<LEDGERNAME>Rent Received</LEDGERNAME>",
      );

      await runScoped(asDb(tx), ctx, async (s) => {
        expect(await earlierTallyExports(s, documentIds)).toEqual([]);
        await recordTallyExport(s, "2026-11-01", "2026-11-30", documentIds, 2);
        const earlier = await earlierTallyExports(s, documentIds);
        expect(earlier).toHaveLength(1);
        expect(earlier[0]!.overlap).toBe(2);
      });
      // An export record can't be changed or deleted, even by the database
      // owner (runScoped's role lasts for the rest of the test transaction).
      await tx.execute(sql`reset role`);
      await expect(
        tx.execute(
          sql`delete from exports where organization_id = ${a.org.id}`,
        ),
      ).rejects.toThrow();
    }));

  it("another organization can't see an export, and a viewer can't record one", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const b = await seedOrg(tx, "B");
      const viewer = await seedOrg(tx, "C", "viewer");
      await runScoped(
        asDb(tx),
        { userId: a.userId, organizationId: a.org.id },
        (s) =>
          recordTallyExport(s, "2026-11-01", "2026-11-30", [a.tenant.id], 0),
      );
      await runScoped(
        asDb(tx),
        { userId: b.userId, organizationId: b.org.id },
        async (s) => {
          expect(await s.tx.select().from(schema.exports)).toEqual([]);
        },
      );
      await expect(
        runScoped(
          asDb(tx),
          { userId: viewer.userId, organizationId: viewer.org.id },
          (s) => recordTallyExport(s, "2026-11-01", "2026-11-30", [], 0),
        ),
      ).rejects.toThrow();
      await tx.execute(sql`reset role`);
      const all = await tx
        .select()
        .from(schema.exports)
        .where(eq(schema.exports.organizationId, a.org.id));
      expect(all).toHaveLength(1);
    }));
});
