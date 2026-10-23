import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import * as schema from "@/lib/db/schema";
import { runScoped, type Scoped, type Transactional } from "@/lib/db/scoped";
import { unitBookings } from "../queries";

async function asOwner(
  tx: TestTx,
  fn: (s: Scoped, org: Awaited<ReturnType<typeof seedOrg>>) => Promise<void>,
) {
  const org = await seedOrg(tx, "A");
  await runScoped(
    tx as unknown as Transactional,
    { userId: org.userId, organizationId: org.org.id },
    (s) => fn(s, org),
  );
}

describe.skipIf(skipDbTests)("unitBookings", () => {
  afterAll(closeDb);

  // A lease's dates are what it bills (a terminated lease's end date is the
  // exit date), so every saved lease holds its units for its dates. A
  // `renewed` version keeps billing up to its own end date (D20).
  it.each(["active", "in_notice", "renewed", "expired", "terminated"] as const)(
    "counts a %s lease as holding its units",
    async (status) => {
      await inRollback(async (tx) => {
        await asOwner(tx, async (s, a) => {
          await s.tx
            .update(schema.leases)
            .set({ status })
            .where(eq(schema.leases.id, a.lease.id));
          expect(await unitBookings(s, [a.unit.id])).toEqual([
            {
              leaseId: a.lease.id,
              unitId: a.unit.id,
              unitCode: "101",
              startDate: "2026-04-01",
              endDate: "2029-03-31",
            },
          ]);
        });
      });
    },
  );

  it("ignores a draft", async () => {
    await inRollback(async (tx) => {
      await asOwner(tx, async (s, a) => {
        // seedOrg's lease is a draft (the column default).
        expect(await unitBookings(s, [a.unit.id])).toEqual([]);
      });
    });
  });
});
