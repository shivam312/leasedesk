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

// November 2026: ₹1,26,360 received + ₹11,700 TDS on 10 Nov → Q3 FY 2026-27.
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
      expect(await ask(3)).toEqual({
        kind: "sent",
        to: ["ap@a.test"],
        amountPaise: 1_170_000,
      });
      expect(sent[0]!.text).toContain("₹11,700 of TDS deducted");
      expect(await ask(3)).toEqual({ kind: "already_today" });
      expect(sent).toHaveLength(1);
      // A quarter with no TDS has nothing to ask for.
      expect(await ask(1)).toEqual({ kind: "nothing_missing" });
      const asked = await runScoped(asDb(tx), ctx, (s) =>
        lastRequests(s, "2026-27"),
      );
      expect(asked.has(`${a.tenant.id}|3`)).toBe(true);
      expect(asked.has(`${a.tenant.id}|1`)).toBe(false);
    }));
});
