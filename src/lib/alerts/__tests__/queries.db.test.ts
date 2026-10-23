import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import { deleteDraft, runBilling } from "@/lib/invoices/run";
import { issueInvoice } from "@/lib/invoices/send";
import { recordPayment } from "@/lib/payments/payments";
import { needsAttention, unpaidTotals } from "../attention";
import { applyReminderDays, markDateDone, snoozeDate } from "../dates";
import { attentionInput, monthTotals, upcomingDates } from "../queries";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

// November 2026: ₹1,17,000 rent + ₹21,060 GST = ₹1,38,060, expected TDS
// 10% of ₹1,17,000 = ₹11,700. Sent 01-11-2026, due 08-11-2026.
async function sentInvoice(tx: TestTx) {
  const { a, ctx, invoice } = await madeDraft(tx);
  await runScoped(asDb(tx), ctx, (s) =>
    issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
  );
  return { a, ctx, invoice };
}

describe.skipIf(skipDbTests)("Today queries", () => {
  afterAll(closeDb);

  it("shows an unpaid tenant as overdue after the due date, and this month's totals", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      const { input, totals } = await runScoped(asDb(tx), ctx, async (s) => ({
        input: await attentionInput(s, "2026-11-20"),
        totals: await monthTotals(s, "2026-11-20"),
      }));
      expect(input.open).toHaveLength(1);
      expect(input.thisMonthNotMade).toBeNull();
      // Unpaid ₹1,38,060, all of it overdue, TDS included as in Unpaid and
      // ageing (the overdue card asks for ₹1,38,060 - ₹11,700 TDS = ₹1,26,360).
      expect(unpaidTotals(input.open, "2026-11-20")).toEqual({
        unpaidPaise: 13_806_000,
        overduePaise: 13_806_000,
      });
      const overdue = needsAttention(input).find((i) => i.kind === "overdue");
      expect(overdue).toMatchObject({
        tenantId: a.tenant.id,
        amountPaise: 12_636_000,
        daysOverdue: 12,
      });
      expect(totals).toEqual({
        month: "2026-11",
        billedPaise: 13_806_000,
        collectedPaise: 0,
        tdsKeptPaise: 0,
      });
    }));

  it("counts a payment as collected and drops the tenant from the list", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      await runScoped(asDb(tx), ctx, (s) =>
        recordPayment(
          s,
          {
            tenantId: a.tenant.id,
            receivedDate: "2026-11-15",
            amountReceivedPaise: 12_636_000,
            tdsPaise: 1_170_000,
            mode: "neft",
            reference: null,
            note: null,
            allocations: "auto",
          },
          "2026-11-15",
        ),
      );
      const { input, totals } = await runScoped(asDb(tx), ctx, async (s) => ({
        input: await attentionInput(s, "2026-11-20"),
        totals: await monthTotals(s, "2026-11-20"),
      }));
      expect(input.open).toEqual([]);
      expect(totals.collectedPaise).toBe(12_636_000);
      expect(totals.tdsKeptPaise).toBe(1_170_000);
    }));

  it("asks for a month's invoices when a running lease has none", () =>
    inRollback(async (tx) => {
      const { ctx } = await sentInvoice(tx);
      const input = await runScoped(asDb(tx), ctx, (s) =>
        attentionInput(s, "2026-12-05"),
      );
      expect(input.thisMonthNotMade).toBe("2026-12");
    }));

  // A month where no lease bills anything (a quarterly lease between its
  // quarters, a rent-free month with ₹0 invoices skipped) has nothing to
  // make, so Today mustn't keep asking, nor the daily email every morning.
  it("doesn't ask for a month in which no lease bills anything", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      // Billed quarterly in advance from April: October–December was
      // billed in October, so December's run has nothing to bill.
      await tx
        .update(schema.leaseCharges)
        .set({ frequency: "quarterly" })
        .where(eq(schema.leaseCharges.leaseId, a.lease.id));
      const result = await runScoped(asDb(tx), ctx, (s) =>
        runBilling(s, "2026-12"),
      );
      expect(result).toMatchObject({ drafted: 0, nothingToBill: 1 });
      const input = await runScoped(asDb(tx), ctx, (s) =>
        attentionInput(s, "2026-12-05"),
      );
      expect(input.thisMonthNotMade).toBeNull();

      // A change after that run (the charge back to monthly) means December
      // bills something again, so Today asks for it again.
      await tx
        .update(schema.leaseCharges)
        .set({ frequency: "monthly" })
        .where(eq(schema.leaseCharges.leaseId, a.lease.id));
      const after = await runScoped(asDb(tx), ctx, (s) =>
        attentionInput(s, "2026-12-05"),
      );
      expect(after.thisMonthNotMade).toBe("2026-12");
    }));

  it("asks again when a month's drafts were all deleted", () =>
    inRollback(async (tx) => {
      const { ctx, invoice } = await madeDraft(tx);
      await runScoped(asDb(tx), ctx, (s) => deleteDraft(s, invoice.id));
      const input = await runScoped(asDb(tx), ctx, (s) =>
        attentionInput(s, "2026-11-05"),
      );
      expect(input.thisMonthNotMade).toBe("2026-11");
    }));

  it("keeps asking when a lease can't be billed, even after a run", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      // No GSTIN: the run can't bill the lease and says so.
      await tx
        .update(schema.billingEntities)
        .set({ gstin: null })
        .where(eq(schema.billingEntities.id, a.entity.id));
      const result = await runScoped(asDb(tx), ctx, (s) =>
        runBilling(s, "2026-12"),
      );
      expect(result.problems).toHaveLength(1);
      const input = await runScoped(asDb(tx), ctx, (s) =>
        attentionInput(s, "2026-12-05"),
      );
      expect(input.thisMonthNotMade).toBe("2026-12");
    }));

  it("snoozes a lease date for a week, then marks it done, logging both", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await sentInvoice(tx);
      const [date] = await tx
        .insert(schema.criticalDates)
        .values({
          organizationId: a.org.id,
          leaseId: a.lease.id,
          type: "escalation",
          date: "2026-12-01",
          remindDays: [30, 7],
        })
        .returning();
      const shown = (today: string) =>
        runScoped(asDb(tx), ctx, async (s) =>
          needsAttention(await attentionInput(s, today))
            .filter((i) => i.kind === "date")
            .map((i) => i.key),
        );
      expect(await shown("2026-11-20")).toEqual([`date:${date!.id}`]);

      const until = await runScoped(asDb(tx), ctx, (s) =>
        snoozeDate(s, date!.id, "2026-11-20"),
      );
      expect(until).toBe("2026-11-27");
      expect(await shown("2026-11-26")).toEqual([]);
      expect(await shown("2026-11-27")).toEqual([`date:${date!.id}`]);

      expect(
        await runScoped(asDb(tx), ctx, (s) => markDateDone(s, date!.id)),
      ).toBe(true);
      const left = await runScoped(asDb(tx), ctx, (s) =>
        upcomingDates(s, "2026-11-27"),
      );
      expect(left.map((d) => d.id)).not.toContain(date!.id);
      // Snoozing a done date does nothing.
      expect(
        await runScoped(asDb(tx), ctx, (s) =>
          snoozeDate(s, date!.id, "2026-11-27"),
        ),
      ).toBeNull();

      const log = await tx
        .select()
        .from(schema.activityLog)
        .where(
          and(
            eq(schema.activityLog.entityType, "critical_dates"),
            eq(schema.activityLog.entityId, date!.id),
          ),
        );
      expect(log).toHaveLength(2);
    }));

  it("gives open lease dates new reminder days when the setting changes", () =>
    inRollback(async (tx) => {
      // seedOrg's lease has an expiry date reminded at 180, 90 and 30 days.
      const { a, ctx } = await sentInvoice(tx);
      const changed = await runScoped(asDb(tx), ctx, (s) =>
        applyReminderDays(s, {
          "alerts.expiryDays": [120, 60],
          "alerts.increaseDays": [30, 7],
          "alerts.lockInDays": [60],
        }),
      );
      expect(changed).toBe(1);
      const [expiry] = await tx
        .select()
        .from(schema.criticalDates)
        .where(
          and(
            eq(schema.criticalDates.leaseId, a.lease.id),
            eq(schema.criticalDates.type, "expiry"),
          ),
        );
      expect(expiry?.remindDays).toEqual([120, 60]);
    }));
});
