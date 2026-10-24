import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  actAs,
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { lastBillingRun, recordedRun, recordJobRun } from "../health";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("job health", () => {
  afterAll(closeDb);

  it("records runs, and reads the last successful billing check", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      await recordJobRun(asDb(tx), a.org.id, {
        job: "billing",
        runDate: "2026-10-22",
        ok: true,
      });
      await expect(
        recordedRun(asDb(tx), a.org.id, "billing", "2026-10-23", async () => {
          throw new Error("database away");
        }),
      ).rejects.toThrow("database away");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      // The failed run on the 23rd doesn't count.
      expect(await runScoped(asDb(tx), ctx, lastBillingRun)).toBe("2026-10-22");
    }));

  it("another organization can't read or write an organization's runs", () =>
    inRollback(async (tx) => {
      const a = await seedOrg(tx, "a");
      const b = await seedOrg(tx, "b");
      await recordJobRun(asDb(tx), a.org.id, {
        job: "billing",
        runDate: "2026-10-22",
        ok: true,
      });
      await actAs(tx, b.userId);
      expect(await tx.select().from(schema.jobRuns)).toEqual([]);
      // Members can't write runs at all, even for their own organization.
      await expect(
        tx.execute(
          sql`insert into job_runs (organization_id, job, run_date, ok) values (${b.org.id}, 'billing', '2026-10-24', true)`,
        ),
      ).rejects.toThrow();
    }));
});
