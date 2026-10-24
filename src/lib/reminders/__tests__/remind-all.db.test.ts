import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import type { Email, EmailDriver } from "@/lib/email";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { runBilling } from "@/lib/invoices/run";
import { issueInvoice } from "@/lib/invoices/send";
import { remindAllMessage, remindAllOverdue } from "../remind-all";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

function outbox() {
  const sent: Email[] = [];
  const driver: EmailDriver = {
    send: async (email) => {
      sent.push(email);
      return { id: String(sent.length), driver: "console" };
    },
  };
  return { sent, driver };
}

// Sent 01-11-2026, due 08-11-2026: ₹1,38,060 less ₹11,700 TDS = ₹1,26,360.
async function overdue(tx: TestTx, email: string | null) {
  const { a, ctx, invoice } = await madeDraft(tx);
  await tx
    .update(schema.tenantContacts)
    .set({ email, role: "billing" })
    .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  await tx.execute(sql`reset role`);
  return { a, ctx, invoice };
}

describe.skipIf(skipDbTests)("Remind all", () => {
  afterAll(closeDb);

  it("emails each overdue tenant once a day, for the amount less TDS", () =>
    inRollback(async (tx) => {
      const { a, ctx, invoice } = await overdue(tx, "ap@a.test");
      const { sent, driver } = outbox();
      const first = await remindAllOverdue(asDb(tx), ctx, "2026-11-20", driver);
      await tx.execute(sql`reset role`);
      expect(first.sent).toEqual([a.tenant.companyName]);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toEqual(["ap@a.test"]);
      expect(sent[0]!.subject).toBe(
        "Overdue: invoice T/26-27/0001, ₹1,26,360 was due on 08-11-2026",
      );
      // This test's rows only (now() is the transaction's start).
      const [row] = await tx
        .select()
        .from(schema.reminders)
        .where(sql`${schema.reminders.createdAt} >= now()`);
      expect(row).toMatchObject({
        invoiceId: invoice.id,
        channel: "email",
        step: null,
        sentBy: a.userId,
        amountAsked: 12_636_000,
        status: "sent",
      });
      // The test's "today" is a date in the future, so stamp the reminder as
      // made on it (the guard trigger refuses any change; bypass it here).
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(
        sql`update reminders set created_at = '2026-11-20T10:00:00+05:30' where id = ${row!.id}`,
      );
      await tx.execute(sql`set local session_replication_role = origin`);
      // A second tap the same day sends nothing.
      const again = await remindAllOverdue(asDb(tx), ctx, "2026-11-20", driver);
      expect(again.alreadyToday).toEqual([a.tenant.companyName]);
      expect(sent).toHaveLength(1);
    }));

  it("lets a failed email be tried again the same day", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await overdue(tx, "ap@a.test");
      const broken: EmailDriver = {
        send: async () => {
          throw new Error("down");
        },
      };
      const first = await remindAllOverdue(asDb(tx), ctx, "2026-11-20", broken);
      await tx.execute(sql`reset role`);
      expect(first.failed).toEqual([a.tenant.companyName]);
      const [row] = await tx
        .select()
        .from(schema.reminders)
        .where(sql`${schema.reminders.createdAt} >= now()`);
      expect(row!.status).toBe("failed");
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(
        sql`update reminders set created_at = '2026-11-20T10:00:00+05:30' where id = ${row!.id}`,
      );
      await tx.execute(sql`set local session_replication_role = origin`);
      // "Try again later" must mean it: the failed one doesn't count as sent.
      const { sent, driver } = outbox();
      const again = await remindAllOverdue(asDb(tx), ctx, "2026-11-20", driver);
      expect(again.sent).toEqual([a.tenant.companyName]);
      expect(sent).toHaveLength(1);
    }));

  it("asks for the oldest invoice's own amount, not the tenant's total", () =>
    inRollback(async (tx) => {
      const { a, ctx, invoice } = await overdue(tx, "ap@a.test");
      // December's invoice too: both overdue by 20-01-2027. The email is
      // about November's (the oldest) and asks for its ₹1,26,360, not the
      // ₹2,52,720 the tenant owes across both.
      await runScoped(asDb(tx), ctx, (s) => runBilling(s, "2026-12"));
      const [december] = await tx
        .select({ id: schema.invoices.id })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.leaseId, a.lease.id),
            eq(schema.invoices.runMonth, "2026-12-01"),
          ),
        );
      await runScoped(asDb(tx), ctx, (s) =>
        issueInvoice(s, december!.id, new Date("2026-12-01T04:30:00Z")),
      );
      await tx.execute(sql`reset role`);
      const { sent, driver } = outbox();
      const r = await remindAllOverdue(asDb(tx), ctx, "2027-01-20", driver);
      expect(r.sent).toEqual([a.tenant.companyName]);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.subject).toBe(
        "Overdue: invoice T/26-27/0001, ₹1,26,360 was due on 08-11-2026",
      );
      const [row] = await tx
        .select()
        .from(schema.reminders)
        .where(sql`${schema.reminders.createdAt} >= now()`);
      expect(row).toMatchObject({
        invoiceId: invoice.id,
        amountAsked: 12_636_000,
      });
    }));

  it("lists tenants with no email address instead", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await overdue(tx, null);
      const { sent, driver } = outbox();
      const r = await remindAllOverdue(asDb(tx), ctx, "2026-11-20", driver);
      expect(r.noEmail).toEqual([a.tenant.companyName]);
      expect(sent).toEqual([]);
      expect(remindAllMessage(r)).toContain(
        `No email address for ${a.tenant.companyName}`,
      );
    }));
});
