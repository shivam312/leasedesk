import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  attachDocument,
  DocumentError,
  documentsFor,
  planUpload,
  recordUpload,
} from "../documents";
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
      await expect(attach(a.lease.id, pdf, 5)).rejects.toThrow(
        /; the most is 0 MB\./,
      );
      await expect(attach(b.lease.id, pdf)).rejects.toThrow(
        /couldn't be found/,
      );
      expect(store.files.size).toBe(0);
    }));

  it("uploads straight to storage: up to 25 MB, checked again once stored", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const store = memoryStore();
      const run = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
        runScoped(asDb(tx), ctx, fn);
      // 31 MB is refused before anything is sent, with the size in words.
      await expect(
        run((s) =>
          planUpload(s, {
            ownerType: "tenant",
            ownerId: a.tenant.id,
            size: 31 * 1024 * 1024,
          }),
        ),
      ).rejects.toThrow("That file is 31 MB; the most is 25 MB.");
      const path = await run((s) =>
        planUpload(s, {
          ownerType: "tenant",
          ownerId: a.tenant.id,
          size: pdf.length,
        }),
      );
      expect(path.startsWith(`${a.org.id}/tenants/${a.tenant.id}/`)).toBe(true);
      // The browser puts the file there; then it's recorded.
      await store.put(path, pdf, "application/pdf");
      const doc = await run((s) =>
        recordUpload(s, store, {
          ownerType: "tenant",
          ownerId: a.tenant.id,
          kind: "id_proof",
          fileName: "PAN card.pdf",
          path,
        }),
      );
      expect(doc).toMatchObject({
        filePath: path,
        contentType: "application/pdf",
      });

      // A file that isn't a PDF or image is deleted, not recorded.
      const bad = await run((s) =>
        planUpload(s, { ownerType: "tenant", ownerId: a.tenant.id, size: 5 }),
      );
      await store.put(
        bad,
        new TextEncoder().encode("hello"),
        "application/pdf",
      );
      await expect(
        run((s) =>
          recordUpload(s, store, {
            ownerType: "tenant",
            ownerId: a.tenant.id,
            kind: "other",
            fileName: "x.pdf",
            path: bad,
          }),
        ),
      ).rejects.toThrow("Upload a PDF, PNG or JPG file.");
      expect(store.files.has(bad)).toBe(false);

      // Only a path in this owner's folder can be recorded.
      await expect(
        run((s) =>
          recordUpload(s, store, {
            ownerType: "lease",
            ownerId: a.lease.id,
            kind: "other",
            fileName: "x.pdf",
            path,
          }),
        ),
      ).rejects.toThrow(DocumentError);
    }));
});
