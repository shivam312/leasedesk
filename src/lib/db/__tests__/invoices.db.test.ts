import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { draftInvoice, seedOrg } from "./fixtures";
import {
  actAs,
  closeDb,
  createAuthUser,
  hasTables,
  inRollback,
  only,
  type TestTx,
} from "./harness";

const ready = await hasTables(
  "invoice_series",
  "invoices",
  "invoice_lines",
  "credit_notes",
  "credit_note_lines",
);

type Org = Awaited<ReturnType<typeof seedOrg>>;

async function series(tx: TestTx, a: Org, kind: "invoice" | "credit_note") {
  return only(
    await tx
      .insert(schema.invoiceSeries)
      .values({
        organizationId: a.org.id,
        billingEntityId: a.entity.id,
        kind,
        financialYear: "26-27",
        prefix: kind === "invoice" ? "T" : "TCN",
      })
      .returning(),
  );
}

/** Send a draft: give it a number and copy the supplier and tenant details. */
async function send(tx: TestTx, a: Org, invoiceId: string) {
  const s = await series(tx, a, "invoice");
  await tx
    .update(schema.invoices)
    .set({
      status: "sent",
      seriesId: s.id,
      number: "T/26-27/0001",
      sentAt: new Date(),
      supplier: {
        legalName: "A",
        gstin: null,
        stateCode: "27",
        address: "Mumbai",
        bankName: null,
        bankAccountName: null,
        bankAccountNumber: null,
        ifsc: null,
        upiId: null,
      },
      recipient: {
        companyName: "A Tenant",
        gstin: null,
        billingAddress: "Mumbai",
        stateCode: "27",
      },
    })
    .where(eq(schema.invoices.id, invoiceId));
}

async function creditNote(tx: TestTx, a: Org, invoiceId: string) {
  const s = await series(tx, a, "credit_note");
  return only(
    await tx
      .insert(schema.creditNotes)
      .values({
        organizationId: a.org.id,
        invoiceId,
        seriesId: s.id,
        number: "TCN/26-27/0001",
        date: "2026-11-10",
        reason: "waiver",
        supplyType: "intra_state",
        taxableAmount: 10000,
        cgst: 900,
        sgst: 900,
        igst: 0,
        total: 11800,
      })
      .returning(),
  );
}

describe.skipIf(!ready)(
  "invoice tables (skipped until pnpm db:migrate)",
  () => {
    afterAll(closeDb);

    it("lets a draft change and be deleted with its lines", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice, line } = await draftInvoice(tx, a);
        await tx
          .update(schema.invoiceLines)
          .set({ description: "Rent for Nov 2026" })
          .where(eq(schema.invoiceLines.id, line.id));
        await tx
          .delete(schema.invoiceLines)
          .where(eq(schema.invoiceLines.id, line.id));
        await tx
          .delete(schema.invoices)
          .where(eq(schema.invoices.id, invoice.id));
      });
    });

    it("refuses totals that don't add up, and a number on a draft", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice } = await draftInvoice(tx, a);
        await expect(
          tx
            .update(schema.invoices)
            .set({ grandTotal: 118001 })
            .where(eq(schema.invoices.id, invoice.id)),
        ).rejects.toThrow();
      });
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice } = await draftInvoice(tx, a);
        await expect(
          tx
            .update(schema.invoices)
            .set({ number: "T/26-27/0001" })
            .where(eq(schema.invoices.id, invoice.id)),
        ).rejects.toThrow();
      });
    });

    it("allows one invoice per lease per monthly run", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        await draftInvoice(tx, a);
        await expect(draftInvoice(tx, a)).rejects.toThrow();
      });
    });

    it("refuses a line for a charge of another lease", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const b = await seedOrg(tx, "B");
        await expect(
          draftInvoice(tx, { ...a, charge: b.charge }),
        ).rejects.toThrow();
      });
    });

    it("freezes a sent invoice and its lines; only the status moves on", async () => {
      const changes: [
        string,
        (tx: TestTx, id: string, lineId: string) => Promise<unknown>,
      ][] = [
        [
          "amounts",
          (tx, id) =>
            tx
              .update(schema.invoices)
              .set({
                taxableTotal: 50000,
                cgstTotal: 4500,
                sgstTotal: 4500,
                grandTotal: 59000,
              })
              .where(eq(schema.invoices.id, id)),
        ],
        [
          "due date",
          (tx, id) =>
            tx
              .update(schema.invoices)
              .set({ dueDate: "2026-12-31" })
              .where(eq(schema.invoices.id, id)),
        ],
        [
          "back to draft",
          (tx, id) =>
            tx.execute(
              sql`update invoices set status = 'draft', number = null, series_id = null where id = ${id}`,
            ),
        ],
        [
          "delete",
          (tx, id) =>
            tx.delete(schema.invoices).where(eq(schema.invoices.id, id)),
        ],
        [
          "line change",
          (tx, _id, lineId) =>
            tx
              .update(schema.invoiceLines)
              .set({ description: "Changed" })
              .where(eq(schema.invoiceLines.id, lineId)),
        ],
        [
          "line delete",
          (tx, _id, lineId) =>
            tx
              .delete(schema.invoiceLines)
              .where(eq(schema.invoiceLines.id, lineId)),
        ],
      ];
      for (const [, change] of changes) {
        await inRollback(async (tx) => {
          const a = await seedOrg(tx, "A");
          const { invoice, line } = await draftInvoice(tx, a);
          await send(tx, a, invoice.id);
          await expect(change(tx, invoice.id, line.id)).rejects.toThrow();
        });
      }
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice } = await draftInvoice(tx, a);
        await send(tx, a, invoice.id);
        await tx
          .update(schema.invoices)
          .set({ status: "part_paid", pdfPath: "invoices/x.pdf" })
          .where(eq(schema.invoices.id, invoice.id));
        await expect(
          tx
            .update(schema.invoices)
            .set({ pdfPath: "invoices/y.pdf" })
            .where(eq(schema.invoices.id, invoice.id)),
        ).rejects.toThrow();
      });
    });

    it("needs a sent invoice for a credit note, and never changes one", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice } = await draftInvoice(tx, a);
        await expect(creditNote(tx, a, invoice.id)).rejects.toThrow();
      });
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice } = await draftInvoice(tx, a);
        await send(tx, a, invoice.id);
        const note = await creditNote(tx, a, invoice.id);
        await expect(
          tx
            .update(schema.creditNotes)
            .set({ note: "Changed" })
            .where(eq(schema.creditNotes.id, note.id)),
        ).rejects.toThrow();
      });
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const { invoice } = await draftInvoice(tx, a);
        await send(tx, a, invoice.id);
        const note = await creditNote(tx, a, invoice.id);
        await expect(
          tx
            .delete(schema.creditNotes)
            .where(eq(schema.creditNotes.id, note.id)),
        ).rejects.toThrow();
      });
    });

    it("refuses a credit note line for a line of another invoice", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const first = await draftInvoice(tx, a, "2026-11-01");
        const second = await draftInvoice(tx, a, "2026-12-01");
        await send(tx, a, first.invoice.id);
        const note = await creditNote(tx, a, first.invoice.id);
        await expect(
          tx.insert(schema.creditNoteLines).values({
            organizationId: a.org.id,
            creditNoteId: note.id,
            invoiceId: first.invoice.id,
            invoiceLineId: second.line.id,
            description: "Rent",
            taxableAmount: 10000,
            gstRateBp: 1800,
            cgst: 900,
            sgst: 900,
            igst: 0,
          }),
        ).rejects.toThrow();
      });
    });

    it("only counts a number series up", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        const s = await series(tx, a, "invoice");
        await tx
          .update(schema.invoiceSeries)
          .set({ nextNumber: 5 })
          .where(eq(schema.invoiceSeries.id, s.id));
        await expect(
          tx
            .update(schema.invoiceSeries)
            .set({ nextNumber: 4 })
            .where(eq(schema.invoiceSeries.id, s.id)),
        ).rejects.toThrow();
      });
    });

    it("hides invoices from other organizations and from strangers", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        await draftInvoice(tx, a);
        const b = await seedOrg(tx, "B");
        await actAs(tx, b.userId);
        expect(await tx.select().from(schema.invoices)).toEqual([]);
        expect(await tx.select().from(schema.invoiceLines)).toEqual([]);
      });
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A");
        await draftInvoice(tx, a);
        await actAs(tx, await createAuthUser(tx, "stranger@example.test"));
        expect(await tx.select().from(schema.invoices)).toEqual([]);
      });
    });

    it("lets accounts write invoices, but not a property manager", async () => {
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A", "accounts");
        await actAs(tx, a.userId);
        await draftInvoice(tx, a);
      });
      await inRollback(async (tx) => {
        const a = await seedOrg(tx, "A", "property_manager");
        await actAs(tx, a.userId);
        await expect(draftInvoice(tx, a)).rejects.toThrow();
      });
    });
  },
);
