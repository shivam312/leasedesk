import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { Tx } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  only,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { markUnitLeased } from "../seed";

const asTx = (tx: TestTx) => tx as unknown as Tx;

describe.skipIf(skipDbTests)("demo seed: unit status", () => {
  afterAll(closeDb);

  // Every query is scoped to the organization (CLAUDE.md rule 6): the demo
  // seed marking its own unit leased must never touch another
  // organization's unit, even when handed that unit's id.
  it("marks only the demo organization's unit as leased", async () => {
    await inRollback(async (tx) => {
      const demo = await seedOrg(tx, "Demo");
      const other = await seedOrg(tx, "Other");
      await tx
        .update(schema.units)
        .set({ status: "vacant" })
        .where(eq(schema.units.id, other.unit.id));

      await markUnitLeased(asTx(tx), demo.org.id, other.unit.id);

      const row = only(
        await tx
          .select({ status: schema.units.status })
          .from(schema.units)
          .where(eq(schema.units.id, other.unit.id)),
      );
      expect(row.status).toBe("vacant");
    });
  });

  it("marks the demo organization's own unit as leased", async () => {
    await inRollback(async (tx) => {
      const demo = await seedOrg(tx, "Demo");
      await tx
        .update(schema.units)
        .set({ status: "vacant" })
        .where(eq(schema.units.id, demo.unit.id));

      await markUnitLeased(asTx(tx), demo.org.id, demo.unit.id);

      const row = only(
        await tx
          .select({ status: schema.units.status })
          .from(schema.units)
          .where(eq(schema.units.id, demo.unit.id)),
      );
      expect(row.status).toBe("leased");
    });
  });
});
