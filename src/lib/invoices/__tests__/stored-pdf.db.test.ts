import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { memoryStore } from "@/lib/files/store";
import { issueInvoice } from "../send";
import { invoicePdfPath, storedPdf, storeSentPdf } from "../stored-pdf";
import { madeDraft } from "./db-fixtures";

const asDb = (tx: TestTx) => tx as unknown as Transactional;
const bytes = new TextEncoder().encode("%PDF-1.4 sent copy");

describe.skipIf(skipDbTests)("the sent invoice's stored PDF", () => {
  afterAll(closeDb);

  it("is stored once at send time, in the organization's folder, and served back", () =>
    inRollback(async (tx) => {
      const { a, ctx, invoice } = await madeDraft(tx);
      const store = memoryStore();
      const run = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
        runScoped(asDb(tx), ctx, fn);
      // A draft has no stored PDF: it's rendered each time.
      expect(await run((s) => storeSentPdf(s, store, invoice.id, bytes))).toBe(
        false,
      );
      await run((s) =>
        issueInvoice(s, invoice.id, new Date("2026-11-01T04:30:00Z")),
      );
      expect(await run((s) => storeSentPdf(s, store, invoice.id, bytes))).toBe(
        true,
      );
      const path = invoicePdfPath(a.org.id, invoice.id);
      expect(path.startsWith(`${a.org.id}/`)).toBe(true);
      expect(store.files.has(path)).toBe(true);
      const [row] = await tx
        .select({ pdfPath: schema.invoices.pdfPath })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id));
      expect(row!.pdfPath).toBe(path);
      expect(await run((s) => storedPdf(s, store, invoice.id))).toEqual(bytes);
      // Only once: a second store is refused, and the first file stays.
      expect(
        await run((s) =>
          storeSentPdf(s, store, invoice.id, new TextEncoder().encode("other")),
        ),
      ).toBe(false);
      expect(await run((s) => storedPdf(s, store, invoice.id))).toEqual(bytes);
    }));
});
