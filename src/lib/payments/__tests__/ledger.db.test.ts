import { afterAll, describe, expect, it } from "vitest";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import { ledgerFor } from "../ledger";
import {
  paymentsWithCredit,
  paymentSettings,
  recordPayment,
  reversePayment,
  unpaidInvoices,
} from "../payments";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("ledgerFor", () => {
  afterAll(closeDb);

  it("lists the sent invoice, payment, TDS and reversal with a running balance", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await madeDraft(tx);
      const run = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
        runScoped(asDb(tx), ctx, fn);
      // A draft isn't owed yet.
      expect((await run((s) => ledgerFor(s, a.tenant.id))).entries).toEqual([]);
      await run((s) =>
        issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
      );
      const pay = (amount: number, tds: number, date: string) =>
        run((s) =>
          recordPayment(
            s,
            {
              tenantId: a.tenant.id,
              receivedDate: date,
              amountReceivedPaise: amount,
              tdsPaise: tds,
              mode: "neft",
              reference: "UTR1",
              note: null,
              allocations: "auto",
            },
            date,
          ),
        );
      // ₹1,00,000 with ₹11,700 TDS, then reversed, then ₹26,360 with no TDS.
      const { payment } = await pay(10_000_000, 1_170_000, "2026-11-10");
      await run((s) =>
        reversePayment(s, payment.id, "2026-11-12", "Wrong amount"),
      );
      await pay(2_636_000, 0, "2026-11-13");

      const ledger = await run((s) => ledgerFor(s, a.tenant.id));
      expect(
        ledger.entries.map((e) => [
          e.kind,
          e.debitPaise,
          e.creditPaise,
          e.balancePaise,
        ]),
      ).toEqual([
        // ₹1,38,060 due
        ["invoice", 13_806_000, 0, 13_806_000],
        // − ₹1,00,000 = ₹38,060; − ₹11,700 TDS = ₹26,360
        ["payment", 0, 10_000_000, 3_806_000],
        ["tds", 0, 1_170_000, 2_636_000],
        // reversed: back to ₹1,38,060
        ["reversal", 10_000_000, 0, 12_636_000],
        ["tds_reversal", 1_170_000, 0, 13_806_000],
        // − ₹26,360 = ₹1,11,700
        ["payment", 0, 2_636_000, 11_170_000],
      ]);
      expect(ledger.entries[0]!.label).toMatch(/^Invoice T\/26-27\/0001$/);
      expect(ledger.entries[1]!.label).toBe(
        "Payment received (NEFT, ref UTR1)",
      );

      // The balance is what is left on the invoices (no credit unapplied).
      const unpaid = await run(async (s) =>
        unpaidInvoices(s, a.tenant.id, await paymentSettings(s, a.tenant.id)),
      );
      expect(ledger.closingPaise).toBe(
        unpaid.reduce((sum, i) => sum + i.outstandingPaise, 0),
      );
    });
  });

  it("goes into credit on an overpayment: balance = unpaid − credit kept", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await madeDraft(tx);
      const run = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
        runScoped(asDb(tx), ctx, fn);
      await run((s) =>
        issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
      );
      // ₹1,50,000 against ₹1,38,060, no TDS: ₹11,940 kept as credit.
      await run((s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-10",
            amountReceivedPaise: 15_000_000,
            tdsPaise: 0,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-10",
        ),
      );
      const ledger = await run((s) => ledgerFor(s, a.tenant.id));
      // ₹1,38,060 − ₹1,50,000 = −₹11,940
      expect(ledger.closingPaise).toBe(-1_194_000);
      const credit = await run((s) => paymentsWithCredit(s, a.tenant.id));
      expect(credit.reduce((sum, c) => sum + c.creditPaise, 0)).toBe(1_194_000);
    });
  });
});
