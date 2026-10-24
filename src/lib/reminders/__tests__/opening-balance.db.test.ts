import { eq, sql } from "drizzle-orm";
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
import {
  removeOpeningBalance,
  setOpeningBalance,
} from "@/lib/payments/opening-balances";
import { PaymentError } from "@/lib/payments/payments";
import { recordWhatsappReminder, whatsappReminder } from "../manual";
import { remindAllOverdue } from "../remind-all";
import { claimDueReminders } from "../run";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

// A tenant with nothing sent yet but ₹2,00,000 owed from before LeaseDesk,
// as on 30-09-2026 (D-028), with an email and a WhatsApp number.
async function owing(tx: TestTx) {
  const { a, ctx } = await madeDraft(tx);
  await tx
    .update(schema.tenantContacts)
    .set({
      email: "ap@a.test",
      role: "billing",
      phone: "+919820012345",
      whatsapp: true,
    })
    .where(eq(schema.tenantContacts.tenantId, a.tenant.id));
  const opening = await runScoped(asDb(tx), ctx, (s) =>
    setOpeningBalance(
      s,
      {
        tenantId: a.tenant.id,
        asOnDate: "2026-09-30",
        amountPaise: 20_000_000,
        note: null,
      },
      "2026-11-20",
    ),
  );
  await tx.execute(sql`reset role`);
  return { a, ctx, opening };
}

describe.skipIf(skipDbTests)("reminders for an opening balance", () => {
  afterAll(closeDb);

  it("Remind all emails it, without an invoice, and records the reminder", () =>
    inRollback(async (tx) => {
      const { a, ctx, opening } = await owing(tx);
      const sent: Email[] = [];
      const driver: EmailDriver = {
        send: async (email) => {
          sent.push(email);
          return { id: "1", driver: "console" };
        },
      };
      const result = await remindAllOverdue(
        asDb(tx),
        ctx,
        "2026-11-20",
        driver,
      );
      await tx.execute(sql`reset role`);
      expect(result.sent).toEqual([a.tenant.companyName]);
      expect(sent[0]!.subject).toBe(
        "Overdue: ₹2,00,000 unpaid from invoices up to 30-09-2026",
      );
      const [row] = await tx
        .select()
        .from(schema.reminders)
        .where(eq(schema.reminders.openingBalanceId, opening.id));
      expect(row).toMatchObject({
        invoiceId: null,
        channel: "email",
        step: null,
        amountAsked: 20_000_000,
        status: "sent",
      });
      // Once reminded, it can still be changed but not removed.
      await expect(
        runScoped(asDb(tx), ctx, (s) => removeOpeningBalance(s, a.tenant.id)),
      ).rejects.toBeInstanceOf(PaymentError);
    }));

  it("the WhatsApp reminder asks for it and is recorded against it", () =>
    inRollback(async (tx) => {
      const { ctx, opening } = await owing(tx);
      await runScoped(asDb(tx), ctx, async (s) => {
        const link = await whatsappReminder(s, opening.id, "2026-11-20");
        expect(link).toMatchObject({ kind: "ready", amountPaise: 20_000_000 });
        if (link.kind === "ready")
          expect(decodeURIComponent(link.url)).toContain(
            "₹2,00,000 is still unpaid from invoices issued up to 30-09-2026",
          );
        const row = await recordWhatsappReminder(s, opening.id, "2026-11-20");
        expect(row).toMatchObject({
          invoiceId: null,
          openingBalanceId: opening.id,
          channel: "whatsapp_link",
        });
      });
    }));

  it("the automatic schedule leaves it alone", () =>
    inRollback(async (tx) => {
      const { ctx } = await owing(tx);
      const { claimed } = await runScoped(asDb(tx), ctx, (s) =>
        claimDueReminders(s, "2026-11-20"),
      );
      expect(claimed).toEqual([]);
    }));
});
