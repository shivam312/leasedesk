import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import { recordPayment } from "@/lib/payments/payments";
import type { Email, EmailDriver } from "@/lib/email";
import { todayInIndia } from "@/lib/today";
import {
  certificateRequestEmail,
  lastRequests,
  requestCertificate,
} from "../requests";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

function outbox() {
  const sent: Email[] = [];
  const driver: EmailDriver = {
    send: async (email) => {
      sent.push(email);
      return { id: "1", driver: "console" };
    },
  };
  return { sent, driver };
}

describe("certificateRequestEmail", () => {
  it("asks for the quarter's Form 16A with the TDS amount and due date", () => {
    const e = certificateRequestEmail({
      to: ["ap@acme.in"],
      tenantName: "Acme",
      landlordName: "Sharma Estates",
      financialYear: "2026-27",
      quarter: 1,
      amountPaise: 35_100_00,
      due: "2026-08-15",
    });
    expect(e.subject).toBe("Please send your Form 16A for Q1 of FY 2026-27");
    expect(e.text).toContain("₹35,100 of TDS deducted");
    expect(e.text).toContain("due by 15-08-2026");
  });
});

// ₹1,26,360 received + ₹11,700 TDS on 10 Jun 2026 → Q1 FY 2026-27, whose
// certificate was due 15 Aug 2026, so it's overdue today.
async function paidWithTds(tx: TestTx) {
  const { a, ctx, invoice } = await madeDraft(tx);
  await tx
    .update(schema.tenantContacts)
    .set({ email: "ap@a.test", role: "billing" })
    .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
  await runScoped(asDb(tx), ctx, async (s) => {
    await issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z"));
    await recordPayment(
      s,
      {
        tenantId: a.tenant.id,
        receivedDate: "2026-06-10",
        amountReceivedPaise: 12_636_000,
        tdsPaise: 1_170_000,
        mode: "neft",
        reference: null,
        note: null,
        allocations: "auto",
      },
      "2026-06-10",
    );
  });
  await tx.execute(sql`reset role`);
  return { a, ctx };
}

describe.skipIf(skipDbTests)("Request from tenant", () => {
  afterAll(closeDb);

  it("emails the billing contact once a day for the quarter's TDS per our records, and records when", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await paidWithTds(tx);
      const { sent, driver } = outbox();
      const today = todayInIndia();
      const ask = (quarter: 1 | 2 | 3 | 4) =>
        requestCertificate(
          asDb(tx),
          ctx,
          { tenantId: a.tenant.id, financialYear: "2026-27", quarter },
          today,
          driver,
        );
      // The amount is worked out here, not taken from the page: ₹11,700.
      expect(await ask(1)).toEqual({
        kind: "sent",
        to: ["ap@a.test"],
        amountPaise: 1_170_000,
      });
      expect(sent[0]!.text).toContain("₹11,700 of TDS deducted");
      expect(await ask(1)).toEqual({ kind: "already_today" });
      expect(sent).toHaveLength(1);
      // A quarter with no TDS has nothing to ask for.
      expect(await ask(2)).toEqual({ kind: "nothing_missing" });
      const asked = await runScoped(asDb(tx), ctx, (s) =>
        lastRequests(s, "2026-27"),
      );
      expect(asked.has(`${a.tenant.id}|1`)).toBe(true);
      expect(asked.has(`${a.tenant.id}|2`)).toBe(false);
    }));

  it("doesn't ask before the certificate is due, and asks only for the part not covered", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await paidWithTds(tx);
      const { sent, driver } = outbox();
      const ask = (today: string) =>
        requestCertificate(
          asDb(tx),
          ctx,
          { tenantId: a.tenant.id, financialYear: "2026-27", quarter: 1 },
          today,
          driver,
        );
      // On 1 Aug 2026 the Q1 certificate isn't due yet (15 Aug).
      expect(await ask("2026-08-01")).toEqual({ kind: "nothing_missing" });
      // A certificate covering ₹5,000 of the ₹11,700 is in: ask for ₹6,700.
      await tx.execute(sql`reset role`);
      const [record] = await tx
        .select({ id: schema.tdsRecords.id })
        .from(schema.tdsRecords)
        .where(eq(schema.tdsRecords.tenantId, a.tenant.id));
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(
        sql`update tds_records set amount = 500000, certificate_received = true where id = ${record!.id}`,
      );
      await tx.execute(
        sql`insert into tds_records (organization_id, tenant_id, payment_id, invoice_id, financial_year, quarter, amount, certificate_received)
            select organization_id, tenant_id, payment_id, invoice_id, financial_year, quarter, 670000, false from tds_records where id = ${record!.id}`,
      );
      await tx.execute(sql`set local session_replication_role = origin`);
      expect(await ask(todayInIndia())).toMatchObject({
        kind: "sent",
        amountPaise: 670_000,
      });
      expect(sent[0]!.text).toContain("₹6,700 of TDS deducted");
    }));
});
