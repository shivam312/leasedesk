import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
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

describe.skipIf(skipDbTests)("Request from tenant", () => {
  afterAll(closeDb);

  it("emails the billing contact once a day and records when", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      await tx
        .update(schema.tenantContacts)
        .set({ email: "ap@a.test", role: "billing" })
        .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const { sent, driver } = outbox();
      const today = todayInIndia();
      const ask = () =>
        requestCertificate(
          asDb(tx),
          ctx,
          {
            tenantId: a.tenant.id,
            financialYear: "2026-27",
            quarter: 1,
            amountPaise: 1_170_000,
          },
          today,
          driver,
        );
      expect(await ask()).toEqual({ kind: "sent", to: ["ap@a.test"] });
      expect(await ask()).toEqual({ kind: "already_today" });
      expect(sent).toHaveLength(1);
      const asked = await runScoped(asDb(tx), ctx, (s) =>
        lastRequests(s, "2026-27"),
      );
      expect(asked.has(`${a.tenant.id}|1`)).toBe(true);
    }));
});
