import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  actAs,
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { EmailError, type Email, type EmailDriver } from "@/lib/email";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import { saveSettings } from "@/lib/settings/store";
import { sendDigests } from "../digest-run";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

function outbox(fail = false) {
  const sent: Email[] = [];
  const driver: EmailDriver = {
    send: async (email) => {
      if (fail) throw new EmailError("The mail server said no.");
      sent.push(email);
      return { id: String(sent.length), driver: "console" };
    },
  };
  return { sent, driver };
}

// November 2026's invoice (₹1,38,060, ₹11,700 TDS expected), sent
// 01-11-2026 and due 08-11-2026, so on 20-11 the tenant is 12 days late.
async function lateTenant(tx: TestTx) {
  const { a, ctx, invoice } = await madeDraft(tx);
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  return { a, ctx };
}

/** The daily job runs as the system: drop the role a runScoped call left set. */
async function digest(tx: TestTx, orgId: string, driver: EmailDriver) {
  await tx.execute(sql`reset role`);
  return sendDigests(asDb(tx), orgId, "2026-11-20", driver, undefined);
}

describe.skipIf(skipDbTests)("daily digest", () => {
  afterAll(closeDb);

  it("emails the owner once a day, and records it", () =>
    inRollback(async (tx) => {
      const { a } = await lateTenant(tx);
      const box = outbox();
      expect(await digest(tx, a.org.id, box.driver)).toEqual({
        sent: 1,
        failed: 0,
      });
      expect(box.sent).toHaveLength(1);
      expect(box.sent[0]!.to).toEqual(["A-owner@example.test"]);
      // ₹1,38,060 less ₹11,700 TDS expected.
      expect(box.sent[0]!.text).toContain("A Tenant hasn't paid ₹1,26,360.");

      // Run again the same day (a retry, or a second run): nothing more.
      expect(await digest(tx, a.org.id, box.driver)).toEqual({
        sent: 0,
        failed: 0,
      });
      const rows = await tx
        .select()
        .from(schema.digestSends)
        .where(eq(schema.digestSends.organizationId, a.org.id));
      expect(rows).toMatchObject([
        {
          userId: a.userId,
          digestDate: "2026-11-20",
          status: "sent",
          itemCount: 1,
        },
      ]);
      // A sent digest's record can't change.
      await expect(
        tx
          .update(schema.digestSends)
          .set({ status: "failed" })
          .where(eq(schema.digestSends.id, rows[0]!.id)),
      ).rejects.toThrow();
    }));

  it("sends nothing when the organization turned it off", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await lateTenant(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        saveSettings(
          s,
          { scope: "organization" },
          { "alerts.dailyDigest": false },
        ),
      );
      const box = outbox();
      expect(await digest(tx, a.org.id, box.driver)).toEqual({
        sent: 0,
        failed: 0,
      });
      expect(box.sent).toEqual([]);
    }));

  it("records a failed send and doesn't try again that day", () =>
    inRollback(async (tx) => {
      const { a } = await lateTenant(tx);
      expect(await digest(tx, a.org.id, outbox(true).driver)).toEqual({
        sent: 0,
        failed: 1,
      });
      const box = outbox();
      expect(await digest(tx, a.org.id, box.driver)).toEqual({
        sent: 0,
        failed: 0,
      });
      const [row] = await tx
        .select()
        .from(schema.digestSends)
        .where(eq(schema.digestSends.organizationId, a.org.id));
      expect(row?.status).toBe("failed");
    }));

  it("hides digest records from other organizations, and nobody writes them from the app", () =>
    inRollback(async (tx) => {
      const { a } = await lateTenant(tx);
      await digest(tx, a.org.id, outbox().driver);
      const b = await seedOrg(tx, "B");
      await actAs(tx, b.userId);
      expect(await tx.select().from(schema.digestSends)).toEqual([]);
      await expect(
        tx.insert(schema.digestSends).values({
          organizationId: b.org.id,
          userId: b.userId,
          digestDate: "2026-11-20",
          sentTo: "b@example.test",
          itemCount: 1,
        }),
      ).rejects.toThrow();
    }));
});
