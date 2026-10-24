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
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import {
  PaymentError,
  recordPayment,
  reversePayment,
} from "@/lib/payments/payments";
import { setOpeningBalance } from "@/lib/payments/opening-balances";
import { addBankAccount, importStatement } from "../imports";
import { confirmLine, ignoreLines, linesToMatch } from "../match";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

// November's invoice T/26-27/0001: ₹1,38,060 with ₹11,700 TDS expected,
// so the tenant pays ₹1,26,360.
async function imported(tx: TestTx, deposit = "1,26,360.00") {
  const { a, ctx, invoice } = await madeDraft(tx);
  await runScoped(asDb(tx), ctx, async (s) => {
    await issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z"));
    const account = await addBankAccount(s, {
      billingEntityId: a.entity.id,
      bankName: "HDFC Bank",
      accountLast4: "1234",
    });
    await importStatement(s, {
      bankAccountId: account.id,
      fileName: "nov.csv",
      rows: [
        ["Date", "Narration", "Deposit"],
        ["10/11/2026", "NEFT CR-A TENANT-INV T/26-27/0001", deposit],
        ["12/11/2026", "INTEREST CREDIT", "123.45"],
      ],
      mapping: {
        date: "Date",
        description: "Narration",
        reference: null,
        credit: "Deposit",
        debit: null,
        amount: null,
        drCr: null,
      },
    });
  });
  const lines = await runScoped(asDb(tx), ctx, (s) => linesToMatch(s));
  return { a, ctx, invoice, lines };
}

describe.skipIf(skipDbTests)("bank matching", () => {
  afterAll(closeDb);

  it("settles a tenant's opening balance from a bank credit, like an invoice (D-028)", async () => {
    await inRollback(async (tx) => {
      const { a, ctx } = await madeDraft(tx);
      // ₹50,000 owed from before LeaseDesk, as on 30-09-2026, and nothing
      // else: a ₹50,000 credit naming the tenant settles it, with no TDS
      // (none is expected on an opening balance).
      const opening = await runScoped(asDb(tx), ctx, async (s) => {
        const ob = await setOpeningBalance(
          s,
          {
            tenantId: a.tenant.id,
            asOnDate: "2026-09-30",
            amountPaise: 5_000_000,
            note: null,
          },
          "2026-11-20",
        );
        const account = await addBankAccount(s, {
          billingEntityId: a.entity.id,
          bankName: "HDFC Bank",
          accountLast4: "1234",
        });
        await importStatement(s, {
          bankAccountId: account.id,
          fileName: "nov.csv",
          rows: [
            ["Date", "Narration", "Deposit"],
            [
              "10/11/2026",
              `NEFT CR-${a.tenant.companyName.toUpperCase()}`,
              "50,000.00",
            ],
          ],
          mapping: {
            date: "Date",
            description: "Narration",
            reference: null,
            credit: "Deposit",
            debit: null,
            amount: null,
            drCr: null,
          },
        });
        return ob;
      });
      const [line] = await runScoped(asDb(tx), ctx, (s) => linesToMatch(s));
      expect(line!.line).toMatchObject({
        matchStatus: "suggested",
        suggestedTenantId: a.tenant.id,
        suggestedInvoiceIds: [opening.id],
      });
      expect(line!.invoiceNumbers).toEqual(["Opening balance"]);
      const payment = await runScoped(asDb(tx), ctx, (s) =>
        confirmLine(s, line!.line.id, a.tenant.id, "2026-11-20"),
      );
      expect(payment).toMatchObject({
        amountReceived: 5_000_000,
        tdsDeducted: 0,
      });
      const allocations = await tx
        .select()
        .from(schema.paymentAllocations)
        .where(eq(schema.paymentAllocations.paymentId, payment.id));
      expect(
        allocations.map((x) => [x.openingBalanceId, x.amountSettled]),
      ).toEqual([[opening.id, 5_000_000]]);
    });
  });

  it("suggests the tenant and invoice on import, and confirming records the payment", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, lines } = await imported(tx);
      const [rent, interest] = lines;
      expect(rent!.line).toMatchObject({
        matchStatus: "suggested",
        suggestedTenantId: a.tenant.id,
        suggestedInvoiceIds: [invoice.id],
        confidence: 100,
      });
      expect(rent!.invoiceNumbers).toEqual(["T/26-27/0001"]);
      expect(rent!.line.suggestedTdsAmount).toBe(1_170_000);
      expect(interest!.line.matchStatus).toBe("unmatched");

      const payment = await runScoped(asDb(tx), ctx, (s) =>
        confirmLine(s, rent!.line.id, a.tenant.id, "2026-11-20"),
      );
      // 1,26,360 received + 11,700 TDS = 1,38,060: paid
      expect(payment).toMatchObject({
        receivedDate: "2026-11-10",
        amountReceived: 12_636_000,
        tdsDeducted: 1_170_000,
        mode: "neft",
        bankStatementLineId: rent!.line.id,
      });
      const [inv] = await tx
        .select({ status: schema.invoices.status })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id));
      expect(inv?.status).toBe("paid");
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          confirmLine(s, rent!.line.id, a.tenant.id, "2026-11-20"),
        ),
      ).rejects.toBeInstanceOf(PaymentError);

      expect(
        await runScoped(asDb(tx), ctx, (s) =>
          ignoreLines(s, [interest!.line.id]),
        ),
      ).toBe(1);
      expect(
        await runScoped(asDb(tx), ctx, (s) => linesToMatch(s)),
      ).toHaveLength(0);
    });
  });

  it("reversing a matched payment frees its bank line", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, lines } = await imported(tx);
      const payment = await runScoped(asDb(tx), ctx, (s) =>
        confirmLine(s, lines[0]!.line.id, a.tenant.id, "2026-11-20"),
      );
      await runScoped(asDb(tx), ctx, (s) =>
        reversePayment(s, payment.id, "2026-11-21", "Wrong tenant"),
      );
      const [line] = await tx
        .select()
        .from(schema.bankStatementLines)
        .where(eq(schema.bankStatementLines.id, lines[0]!.line.id));
      expect(line?.matchStatus).toBe("unmatched");
      // and it can be confirmed again
      await runScoped(asDb(tx), ctx, (s) =>
        confirmLine(s, lines[0]!.line.id, a.tenant.id, "2026-11-21"),
      );
    });
  });

  it("refuses when what the tenant owes changed since the suggestion", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice, lines } = await imported(tx);
      // ₹50,000 paid by hand first: the suggested ₹11,700 TDS no longer fits
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-09",
            amountReceivedPaise: 5_000_000,
            tdsPaise: 0,
            mode: "cheque",
            reference: null,
            note: null,
            allocations: [{ invoiceId: invoice.id, amountPaise: 5_000_000 }],
          },
          "2026-11-20",
        ),
      );
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          confirmLine(s, lines[0]!.line.id, a.tenant.id, "2026-11-20"),
        ),
      ).rejects.toThrow(/has changed since this was suggested/);
    });
  });

  it("refuses when the suggested invoice was paid by hand, even with no TDS", async () => {
    await inRollback(async (tx) => {
      // ₹1,38,060 in full: suggested for T/26-27/0001 with no TDS.
      const { a, ctx, invoice, lines } = await imported(tx, "1,38,060.00");
      expect(lines[0]!.line).toMatchObject({
        suggestedInvoiceIds: [invoice.id],
        suggestedTdsAmount: 0,
      });
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-09",
            amountReceivedPaise: 13_806_000,
            tdsPaise: 0,
            mode: "cheque",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-20",
        ),
      );
      // Still TDS ₹0, but nothing for it to pay: look again, don't record
      // ₹1,38,060 as credit without asking.
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          confirmLine(s, lines[0]!.line.id, a.tenant.id, "2026-11-20"),
        ),
      ).rejects.toThrow(/has changed since this was suggested/);
    });
  });
});
