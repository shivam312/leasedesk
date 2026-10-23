import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { sameGstinEntityIds } from "../queries";

const asDb = (tx: TestTx) => tx as unknown as Transactional;
const GSTIN = "27AAPFU0939F1ZV";

describe.skipIf(skipDbTests)("sameGstinEntityIds", () => {
  afterAll(closeDb);

  // The building form checks prefixes across these entities' buildings, as
  // they share number series (BILLING_RULES section 9, Codex review M4).
  it("finds the billing entities with the same GSTIN, in this organization only", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const b = await seedOrg(tx, "B");
      const entity = (organizationId: string, gstin: string | null) =>
        tx
          .insert(schema.billingEntities)
          .values({
            organizationId,
            legalName: "Entity",
            gstin,
            stateCode: "27",
            address: "Mumbai",
          })
          .returning()
          .then((rows) => rows[0]!.id);
      const one = await entity(a.org.id, GSTIN);
      const two = await entity(a.org.id, GSTIN);
      await entity(a.org.id, "27AAACT2727Q1ZW");
      await entity(b.org.id, GSTIN);
      const run = (id: string) =>
        runScoped(
          asDb(tx),
          { userId: a.userId, organizationId: a.org.id },
          (s) => sameGstinEntityIds(s, id),
        );
      expect((await run(one)).sort()).toEqual([one, two].sort());
      // The seeded entity has no GSTIN: it stands alone.
      expect(await run(a.entity.id)).toEqual([a.entity.id]);
    });
  });
});
