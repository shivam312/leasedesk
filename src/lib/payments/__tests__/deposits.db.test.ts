import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import {
  closeDb,
  inRollback,
  skipDbTests,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { madeDraft } from "@/lib/invoices/__tests__/db-fixtures";
import {
  DepositError,
  depositLedger,
  recordDepositEntry,
  recordDepositHeld,
  canRecordHeld,
} from "../deposits";
import * as schema from "@/lib/db/schema";

const asDb = (tx: TestTx) => tx as unknown as Transactional;
const today = "2026-11-30";

describe.skipIf(skipDbTests)("the deposit ledger", () => {
  afterAll(closeDb);

  it("records the agreed deposit as already held, once, on the lease start", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await madeDraft(tx);
      await tx
        .update(schema.leases)
        .set({ depositAmount: 36_000_000 })
        .where(sql`${schema.leases.id} = ${a.lease.id}`);
      const entry = await runScoped(asDb(tx), ctx, (s) =>
        recordDepositHeld(s, a.lease.id, today),
      );
      // ₹3,60,000 the lease agrees, received on its start date.
      expect(entry).toMatchObject({
        kind: "received",
        amount: 36_000_000,
        date: a.lease.startDate,
      });
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          recordDepositHeld(s, a.lease.id, today),
        ),
      ).rejects.toBeInstanceOf(DepositError);
      // A renewal's deposit is on the earlier version: not offered.
      expect(
        canRecordHeld({
          status: "active",
          replacesLeaseId: a.lease.id,
          depositAmount: 1,
        }),
      ).toBe(false);
      expect(
        canRecordHeld({
          status: "renewed",
          replacesLeaseId: null,
          depositAmount: 1,
        }),
      ).toBe(false);
    }));

  it("holds what was received, and lets out only what's held, in date order", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await madeDraft(tx);
      const add = (
        kind: "received" | "refunded" | "adjusted" | "forfeited",
        amountPaise: number,
        date = "2026-11-20",
      ) =>
        runScoped(asDb(tx), ctx, (s) =>
          recordDepositEntry(
            s,
            {
              leaseId: a.lease.id,
              kind,
              date,
              amountPaise,
              reference: null,
              note: null,
            },
            today,
          ),
        );
      const held = async () =>
        (await runScoped(asDb(tx), ctx, (s) => depositLedger(s, a.lease.id)))
          .heldPaise;
      await add("received", 3_00_000_00);
      // Using it for unpaid rent waits on D-034.
      await expect(add("adjusted", 1_00_000_00)).rejects.toThrow(
        /isn't available yet/,
      );
      // ₹20,000 kept for damage: ₹2,80,000 held.
      await add("forfeited", 20_000_00);
      expect(await held()).toBe(2_80_000_00);
      await expect(add("refunded", 2_80_000_01)).rejects.toThrow(
        "Only ₹2,80,000 of the deposit is held.",
      );
      await expect(add("refunded", 100, "2026-11-01")).rejects.toThrow(
        "Nothing was held on 01-11-2026. Check the date.",
      );
      await add("refunded", 2_80_000_00);
      expect(await held()).toBe(0);
      await expect(add("forfeited", 100)).rejects.toThrow(DepositError);
    }));

  it("never lets an entry be changed", () =>
    inRollback(async (tx) => {
      const { a, ctx } = await madeDraft(tx);
      const entry = await runScoped(asDb(tx), ctx, (s) =>
        recordDepositEntry(
          s,
          {
            leaseId: a.lease.id,
            kind: "received",
            date: "2026-11-01",
            amountPaise: 1_00_000_00,
            reference: "UTR1",
            note: null,
          },
          today,
        ),
      );
      await tx.execute(sql`reset role`);
      await expect(
        tx.execute(
          sql`update deposit_entries set amount = 1 where id = ${entry.id}`,
        ),
      ).rejects.toThrow();
    }));
});
