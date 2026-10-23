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
const GSTIN = "27AAACT2727Q1ZW";

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
              gstin: GSTIN,
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
            gstin: GSTIN,
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

  // Section 9: numbers are unique within the GSTIN and financial year. Two
  // billing entities can carry the same GSTIN (say, one per bank account), so
  // they must share one series. By hand: entity 1 takes T/26-27/0001, entity
  // 2 (same GSTIN, same prefix) must take T/26-27/0002, not 0001 again; then
  // entity 1 takes 0003. A different GSTIN keeps its own series from 0001.
  it("shares one series between billing entities with the same GSTIN", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const [second] = await tx
        .insert(schema.billingEntities)
        .values({
          organizationId: a.org.id,
          legalName: "A second account",
          gstin: GSTIN,
          stateCode: "27",
          address: "Mumbai",
        })
        .returning();
      const take = (billingEntityId: string, gstin: string) =>
        runScoped(asDb(tx), ctx, (s) =>
          takeNumber(s, {
            billingEntityId,
            gstin,
            kind: "invoice",
            prefix: "T",
            date: "2026-11-01",
            format: DEFAULT_NUMBER_FORMAT,
            startingNumber: {},
          }),
        );
      const first = await take(a.entity.id, GSTIN);
      const other = await take(second!.id, GSTIN);
      expect(first.number).toBe("T/26-27/0001");
      expect(other.number).toBe("T/26-27/0002");
      expect(other.seriesId).toBe(first.seriesId);
      expect((await take(a.entity.id, GSTIN)).number).toBe("T/26-27/0003");
      // A GSTIN typed in lower case or with spaces is the same GSTIN.
      expect((await take(second!.id, " 27aaact2727q1zw")).number).toBe(
        "T/26-27/0004",
      );
      expect((await take(second!.id, "29AAACT2727Q1ZS")).number).toBe(
        "T/26-27/0001",
      );
    });
  });
});
