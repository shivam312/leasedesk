// The daily jobs run as the database owner (runAsSystem), so row-level
// security doesn't stop them: only each query's organization filter does.
// Two organizations with the same setup; running a job for one must never
// read, change or email anything of the other's.

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { sendDigests } from "@/lib/alerts/digest-run";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runAsSystem, runScoped, type Transactional } from "@/lib/db/scoped";
import { removeDemo } from "@/lib/demo/seed";
import { DEMO_ORG_NAME } from "@/lib/demo/plan";
import type { Email, EmailDriver } from "@/lib/email";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { runBilling } from "@/lib/invoices/run";
import { issueInvoice } from "@/lib/invoices/send";
import { sendDueReminders } from "@/lib/reminders/run";
import { dailyRunLate, recordJobRun } from "../health";

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

/** Organizations A and B, each with a sent November invoice to its own contact. */
async function twoOrganizations(tx: TestTx) {
  const orgs = [];
  for (const name of ["A", "B"]) {
    // Each fixture leaves its user's role set; back to the owner first.
    await tx.execute(sql`reset role`);
    const { a, ctx, invoice } = await madeDraft(tx, name);
    await tx.execute(sql`reset role`);
    await tx
      .update(schema.tenantContacts)
      .set({ email: `ap@${name.toLowerCase()}.test`, role: "billing" })
      .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
    await runScoped(asDb(tx), ctx, (s) =>
      issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
    );
    orgs.push({ ...a, invoice });
  }
  // Back to the database owner, as the jobs run.
  await tx.execute(sql`reset role`);
  return orgs as [(typeof orgs)[0], (typeof orgs)[0]];
}

describe.skipIf(skipDbTests)("daily jobs never cross organizations", () => {
  afterAll(closeDb);

  it("the billing run makes drafts only for its own organization", () =>
    inRollback(async (tx) => {
      const [a, b] = await twoOrganizations(tx);
      await runAsSystem(asDb(tx), a.org.id, (s) => runBilling(s, "2026-12"));
      const december = await tx
        .select({ organizationId: schema.invoices.organizationId })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.runMonth, "2026-12-01"),
            inArray(schema.invoices.organizationId, [a.org.id, b.org.id]),
          ),
        );
      expect(december.map((i) => i.organizationId)).toEqual([a.org.id]);
    }));

  it("reminders go only to the organization's own tenants", () =>
    inRollback(async (tx) => {
      const [a, b] = await twoOrganizations(tx);
      const { sent, driver } = outbox();
      // 05-11-2026: both invoices have a reminder due (3 days before 08-11).
      expect(
        await sendDueReminders(asDb(tx), a.org.id, "2026-11-05", driver),
      ).toMatchObject({ sent: 1 });
      expect(sent.map((e) => e.to)).toEqual([["ap@a.test"]]);
      const claimed = await tx
        .select({ invoiceId: schema.reminders.invoiceId })
        .from(schema.reminders)
        // This test's rows only (now() is the transaction's start).
        .where(sql`${schema.reminders.createdAt} >= now()`);
      expect(claimed.map((r) => r.invoiceId)).toEqual([a.invoice.id]);
      expect(claimed.map((r) => r.invoiceId)).not.toContain(b.invoice.id);
    }));

  it("the daily digest goes only to the organization's own team", () =>
    inRollback(async (tx) => {
      const [a] = await twoOrganizations(tx);
      const { sent, driver } = outbox();
      await sendDigests(asDb(tx), a.org.id, "2026-11-20", driver, undefined);
      const digests = await tx
        .select({ organizationId: schema.digestSends.organizationId })
        .from(schema.digestSends);
      expect(new Set(digests.map((d) => d.organizationId))).toEqual(
        new Set([a.org.id]),
      );
      // Only A's owner (A-owner@example.test), never B's.
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.flatMap((e) => e.to).map((t) => t.toLowerCase())).toEqual([
        "a-owner@example.test",
      ]);
    }));

  it("one organization's job runs don't count for another", () =>
    inRollback(async (tx) => {
      const [a, b] = await twoOrganizations(tx);
      await tx
        .update(schema.organizations)
        .set({ createdAt: new Date("2026-10-01T00:00:00Z") })
        .where(inArray(schema.organizations.id, [a.org.id, b.org.id]));
      await recordJobRun(asDb(tx), a.org.id, {
        job: "billing",
        runDate: "2026-10-24",
        ok: true,
      });
      const late = (id: string, userId: string) =>
        runScoped(asDb(tx), { userId, organizationId: id }, (s) =>
          dailyRunLate(s, "2026-10-24"),
        );
      expect(await late(a.org.id, a.userId)).toBeNull();
      expect(await late(b.org.id, b.userId)).toBe("2026-10-01");
    }));

  it("resetting the demo leaves another organization with the demo's name alone", () =>
    inRollback(async (tx) => {
      const other = await seedOrg(tx, DEMO_ORG_NAME);
      await removeDemo(asDb(tx));
      const [still] = await tx
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, other.org.id));
      expect(still).toBeDefined();
    }));
});
