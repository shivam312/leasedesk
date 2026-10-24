import { afterAll, describe, expect, it } from "vitest";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { setupChecklist } from "../checklist";
import { markSetupStep, setupFacts } from "../queries";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("setup checklist facts", () => {
  afterAll(closeDb);

  it("reads one organization's setup, and a step marked done stays done", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const b = await seedOrg(tx, "B");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await runScoped(asDb(tx), ctx, (s) => markSetupStep(s, "team"));
      const facts = await runScoped(asDb(tx), ctx, (s) => setupFacts(s));
      expect(facts.marked).toEqual(["team"]);
      expect(facts.unitCount).toBeGreaterThan(0);
      // The fixture's business has no GSTIN; it still counts.
      expect(facts.hasBusiness).toBe(true);
      const list = setupChecklist(facts);
      expect(list.steps.find((s) => s.key === "team")?.done).toBe(true);
      // B's own setup isn't touched by A's.
      const other = await runScoped(
        asDb(tx),
        { userId: b.userId, organizationId: b.org.id },
        (s) => setupFacts(s),
      );
      expect(other.marked).toEqual([]);
    }));
});
