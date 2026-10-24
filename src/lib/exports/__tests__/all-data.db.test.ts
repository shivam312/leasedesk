import { eq } from "drizzle-orm";
import { unzipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { read, utils } from "xlsx";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { memoryStore } from "@/lib/files/store";
import { exportAllData } from "../all-data";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("export all data", () => {
  afterAll(closeDb);

  it("has only this organization's rows and files, and is logged", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const b = await seedOrg(tx, "B");
      const store = memoryStore();
      const docPath = `${a.org.id}/tenants/${a.tenant.id}/id.pdf`;
      await store.put(
        docPath,
        new Uint8Array([37, 80, 68, 70]),
        "application/pdf",
      );
      await store.put(
        `${b.org.id}/tenants/x/other.pdf`,
        new Uint8Array([1]),
        "application/pdf",
      );
      await tx.insert(schema.documents).values({
        organizationId: a.org.id,
        ownerType: "tenant",
        ownerId: a.tenant.id,
        kind: "id_proof",
        filePath: docPath,
        fileName: "id.pdf",
        contentType: "application/pdf",
        sizeBytes: 4,
        uploadedBy: a.userId,
      });
      const zip = unzipSync(
        await runScoped(
          asDb(tx),
          { userId: a.userId, organizationId: a.org.id },
          (s) => exportAllData(s, store, "2026-10-24"),
        ),
      );
      expect(Object.keys(zip)).toContain(`files/tenants/${a.tenant.id}/id.pdf`);
      expect(Object.keys(zip).some((k) => k.includes("other.pdf"))).toBe(false);
      const tenantsSheet = utils.sheet_to_json<{ id: string }>(
        read(zip["tenants.xlsx"]!).Sheets.tenants!,
      );
      expect(tenantsSheet.map((t) => t.id)).toEqual([a.tenant.id]);
      const [log] = await tx
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.action, "export"));
      expect(log).toMatchObject({
        organizationId: a.org.id,
        actorUserId: a.userId,
      });
    }));
});
