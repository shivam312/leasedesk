import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  closeDb,
  skipDbTests,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { DEFAULT_NUMBER_FORMAT } from "../number";
import { takeNumber } from "../numbering";

const asDb = (tx: TestTx) => tx as unknown as Transactional;

describe.skipIf(skipDbTests)("takeNumber", () => {
  afterAll(closeDb);

  it("numbers consecutively per series and starts again each financial year", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const take = (
        date: string,
        kind: "invoice" | "credit_note" = "invoice",
      ) =>
        runScoped(
          asDb(tx),
          { userId: a.userId, organizationId: a.org.id },
          (s) =>
            takeNumber(s, {
              billingEntityId: a.entity.id,
              kind,
              prefix: kind === "invoice" ? "T" : "TCN",
              date,
              format: DEFAULT_NUMBER_FORMAT,
              startingNumber: { "2026-27": 41 },
            }),
        );
      expect((await take("2026-11-01")).number).toBe("T/26-27/0041");
      expect((await take("2026-12-01")).number).toBe("T/26-27/0042");
      expect((await take("2026-12-05", "credit_note")).number).toBe(
        "TCN/26-27/0041",
      );
      expect((await take("2027-04-01")).number).toBe("T/27-28/0001");
      const series = await tx
        .select()
        .from(schema.invoiceSeries)
        .where(eq(schema.invoiceSeries.organizationId, a.org.id));
      expect(series).toHaveLength(3);
    });
  });

  it("doesn't count up when the number would be too long", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          takeNumber(s, {
            billingEntityId: a.entity.id,
            kind: "invoice",
            prefix: "TOOLONGPREFIX",
            date: "2026-11-01",
            format: DEFAULT_NUMBER_FORMAT,
            startingNumber: {},
          }),
        ),
      ).rejects.toThrow(/16/);
    });
  });
});
