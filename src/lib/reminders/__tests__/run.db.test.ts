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
import { EmailError } from "@/lib/email";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { issueInvoice } from "@/lib/invoices/send";
import { recordPayment } from "@/lib/payments/payments";
import { saveSettings } from "@/lib/settings/store";
import { recordWhatsappReminder, whatsappReminder } from "../manual";
import { sendDueReminders } from "../run";

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

// November 2026: ₹1,17,000 rent + ₹21,060 GST = ₹1,38,060, expected TDS
// 10% of ₹1,17,000 = ₹11,700, so a reminder asks for ₹1,26,360. Sent
// 01-11-2026, due 08-11-2026: default steps 05-11, 09-11, 15-11, 23-11.
async function sentInvoice(tx: TestTx, email: string | null = "ap@a.test") {
  const { a, ctx, invoice } = await madeDraft(tx);
  if (email)
    await tx
      .update(schema.tenantContacts)
      .set({ email, role: "billing" })
      .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  return { a, ctx, invoice };
}

/** The daily job runs as the system: drop the role a runScoped call left set. */
async function remind(
  tx: TestTx,
  organizationId: string,
  today: string,
  driver: EmailDriver,
) {
  await tx.execute(sql`reset role`);
  return sendDueReminders(asDb(tx), organizationId, today, driver);
}

// Only this test's rows: now() is the start of the test's transaction, and
// the shared local database may hold other reminders (the demo's).
const rows = (tx: TestTx) =>
  tx
    .select()
    .from(schema.reminders)
    .where(sql`${schema.reminders.createdAt} >= now()`)
    .orderBy(schema.reminders.createdAt);

describe.skipIf(skipDbTests)("sendDueReminders", () => {
  afterAll(closeDb);

  it("emails the step due today once, asking for the amount less TDS", async () => {
    await inRollback(async (tx) => {
      const { a, invoice } = await sentInvoice(tx);
      const { sent, driver } = outbox();
      const run = (today: string) => remind(tx, a.org.id, today, driver);

      expect(await run("2026-11-04")).toEqual({
        sent: 0,
        failed: 0,
        noEmail: 0,
      });
      expect(await run("2026-11-05")).toEqual({
        sent: 1,
        failed: 0,
        noEmail: 0,
      });
      // Run again the same day (a retry): nothing more.
      expect(await run("2026-11-05")).toEqual({
        sent: 0,
        failed: 0,
        noEmail: 0,
      });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toEqual(["ap@a.test"]);
      expect(sent[0]!.subject).toBe(
        "Reminder: invoice T/26-27/0001 for ₹1,26,360 is due on 08-11-2026",
      );
      const [r] = await rows(tx);
      expect(r).toMatchObject({
        invoiceId: invoice.id,
        channel: "email",
        step: "before:3",
        amountAsked: 12_636_000,
        status: "sent",
        sentBy: null,
      });

      expect(await run("2026-11-09")).toMatchObject({ sent: 1 });
      expect(sent[1]!.subject).toBe(
        "Overdue: invoice T/26-27/0001, ₹1,26,360 was due on 08-11-2026",
      );
      const logged = await tx
        .select()
        .from(schema.activityLog)
        .where(
          and(
            eq(schema.activityLog.entityType, "reminder_email"),
            sql`${schema.activityLog.at} >= now()`,
          ),
        );
      expect(logged).toHaveLength(2);
    });
  });

  it("asks only for what is left after a part payment, and nothing once paid", async () => {
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      const { sent, driver } = outbox();
      // Paid ₹26,360 with no TDS: ₹1,11,700 left, ₹11,700 TDS still expected,
      // so ask ₹1,00,000.
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-03",
            amountReceivedPaise: 2_636_000,
            tdsPaise: 0,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-03",
        ),
      );
      await remind(tx, a.org.id, "2026-11-05", driver);
      expect(sent[0]!.subject).toContain("₹1,00,000");

      // The rest, with TDS: nothing left to ask.
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-06",
            amountReceivedPaise: 10_000_000,
            tdsPaise: 1_170_000,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-06",
        ),
      );
      expect(await remind(tx, a.org.id, "2026-11-09", driver)).toEqual({
        sent: 0,
        failed: 0,
        noEmail: 0,
      });
    });
  });

  it("sends nothing to a tenant with automatic reminders off", async () => {
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        saveSettings(
          s,
          { scope: "tenant", id: a.tenant.id },
          {
            "reminders.autoSend": false,
          },
        ),
      );
      const { sent, driver } = outbox();
      await remind(tx, a.org.id, "2026-11-05", driver);
      expect(sent).toHaveLength(0);
      expect(await rows(tx)).toHaveLength(0);
    });
  });

  it("sends nothing when the organization has switched reminders off", async () => {
    await inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        saveSettings(
          s,
          { scope: "organization" },
          {
            "reminders.beforeDueDays": [],
            "reminders.afterDueDays": [],
          },
        ),
      );
      const { sent, driver } = outbox();
      await remind(tx, a.org.id, "2026-11-09", driver);
      expect(sent).toHaveLength(0);
    });
  });

  it("records a tenant without an email address, and a failed send", async () => {
    await inRollback(async (tx) => {
      const { a } = await sentInvoice(tx, null);
      const { driver } = outbox(true);
      expect(await remind(tx, a.org.id, "2026-11-05", driver)).toEqual({
        sent: 0,
        failed: 0,
        noEmail: 1,
      });
      expect((await rows(tx))[0]).toMatchObject({ status: "no_email" });

      await tx
        .update(schema.tenantContacts)
        .set({ email: "ap@a.test" })
        .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
      expect(await remind(tx, a.org.id, "2026-11-09", driver)).toEqual({
        sent: 0,
        failed: 1,
        noEmail: 0,
      });
      // Both rows share the transaction's created_at, so find it by step.
      expect((await rows(tx)).find((r) => r.step === "after:1")).toMatchObject({
        status: "failed",
      });
    });
  });

  it("never lets a sent reminder be changed or deleted", async () => {
    await inRollback(async (tx) => {
      const { a } = await sentInvoice(tx);
      await remind(tx, a.org.id, "2026-11-05", outbox().driver);
      const [r] = await rows(tx);
      await expect(
        tx.execute(
          sql`update reminders set amount_asked = 1 where id = ${r!.id}`,
        ),
      ).rejects.toThrow();
    });
  });
});

describe.skipIf(skipDbTests)("WhatsApp reminder", () => {
  afterAll(closeDb);

  it("links to the WhatsApp contact with the amount less TDS, and records who sent it", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx, null);
      const ready = () =>
        runScoped(asDb(tx), ctx, (s) =>
          whatsappReminder(s, invoice.id, "2026-11-15"),
        );
      expect(await ready()).toEqual({ kind: "no_number" });

      await tx
        .update(schema.tenantContacts)
        .set({ phone: "+919820012345", whatsapp: true })
        .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
      const link = await ready();
      expect(link).toMatchObject({
        kind: "ready",
        phone: "+919820012345",
        // ₹1,38,060 − ₹11,700 TDS = ₹1,26,360
        amountPaise: 12_636_000,
      });
      expect(link.kind === "ready" && link.url).toMatch(
        /^https:\/\/wa\.me\/919820012345\?text=/,
      );

      const row = await runScoped(asDb(tx), ctx, (s) =>
        recordWhatsappReminder(s, invoice.id, "2026-11-15"),
      );
      expect(row).toMatchObject({
        channel: "whatsapp_link",
        step: null,
        sentBy: a.userId,
        sentTo: ["+919820012345"],
        amountAsked: 12_636_000,
        status: "sent",
      });
    });
  });

  it("has nothing to ask once the invoice is paid", async () => {
    await inRollback(async (tx) => {
      const { a, ctx, invoice } = await sentInvoice(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-06",
            amountReceivedPaise: 12_636_000,
            tdsPaise: 1_170_000,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-06",
        ),
      );
      expect(
        await runScoped(asDb(tx), ctx, (s) =>
          recordWhatsappReminder(s, invoice.id, "2026-11-15"),
        ),
      ).toBeNull();
    });
  });
});
