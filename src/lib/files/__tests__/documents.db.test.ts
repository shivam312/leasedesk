import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { attachDocument, DocumentError, documentsFor } from "../documents";
import { memoryStore } from "../store";

const asDb = (tx: TestTx) => tx as unknown as Transactional;
const pdf = new TextEncoder().encode("%PDF-1.4 signed lease");

describe.skipIf(skipDbTests)("documents on a lease", () => {
  afterAll(closeDb);

  it("keeps the signed agreement in the organization's folder and lists it", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const store = memoryStore();
      const doc = await runScoped(asDb(tx), ctx, (s) =>
        attachDocument(s, store, {
          ownerType: "lease",
          ownerId: a.lease.id,
          kind: "agreement",
          fileName: "Lease 301.pdf",
          bytes: pdf,
        }),
      );
      expect(doc.filePath.startsWith(`${a.org.id}/leases/${a.lease.id}/`)).toBe(
        true,
      );
      expect(doc).toMatchObject({
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        uploadedBy: a.userId,
      });
      const list = await runScoped(asDb(tx), ctx, (s) =>
        documentsFor(s, "lease", a.lease.id),
      );
      expect(list.map((d) => d.fileName)).toEqual(["Lease 301.pdf"]);
    }));

  it("refuses a file that isn't a PDF or image, one too big, and another organization's lease", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      const store = memoryStore();
      const attach = (ownerId: string, bytes: Uint8Array, max?: number) =>
        runScoped(
          asDb(tx),
          { userId: a.userId, organizationId: a.org.id },
          (s) =>
            attachDocument(
              s,
              store,
              {
                ownerType: "lease",
                ownerId,
                kind: "other",
                fileName: "x",
                bytes,
              },
              max,
            ),
        );
      await expect(
        attach(a.lease.id, new TextEncoder().encode("hello")),
      ).rejects.toThrow(DocumentError);
      await expect(attach(a.lease.id, pdf, 5)).rejects.toThrow(/over 0 MB/);
      await expect(attach(b.lease.id, pdf)).rejects.toThrow(
        /couldn't be found/,
      );
      expect(store.files.size).toBe(0);
    }));
});
