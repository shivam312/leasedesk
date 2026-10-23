import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import {
  actAs,
  closeDb,
  hasTables,
  inRollback,
  type TestTx,
} from "@/lib/db/__tests__/harness";
import { parseCsv } from "../csv";
import { addBankAccount, ImportError, importStatement } from "../imports";
import { suggestMapping } from "../statement";

const ready = await hasTables(
  "bank_accounts",
  "bank_statement_imports",
  "bank_statement_lines",
);
const asDb = (tx: TestTx) => tx as unknown as Transactional;
const rows = parseCsv(
  readFileSync(
    join(process.cwd(), "tests/fixtures/bank/synthetic/hdfc-like.csv"),
    "utf8",
  ),
);
const mapping = suggestMapping(rows)!.mapping;

describe.skipIf(!ready)("bank imports (skipped until pnpm db:migrate)", () => {
  afterAll(closeDb);

  it("imports credits once, remembers the columns, and skips repeats", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const account = await runScoped(asDb(tx), ctx, (s) =>
        addBankAccount(s, {
          billingEntityId: a.entity.id,
          bankName: "HDFC Bank",
          accountLast4: "1234",
        }),
      );
      const first = await runScoped(asDb(tx), ctx, (s) =>
        importStatement(s, {
          bankAccountId: account.id,
          fileName: "nov.csv",
          rows,
          mapping,
        }),
      );
      expect(first.import).toMatchObject({
        lineCount: 3,
        duplicateCount: 0,
        debitCount: 1,
        periodStart: "2026-11-01",
        periodEnd: "2026-11-05",
      });
      const [saved] = await tx
        .select()
        .from(schema.bankAccounts)
        .where(eq(schema.bankAccounts.id, account.id));
      expect(saved?.columnMapping).toEqual(mapping);
      // The same file again: nothing new
      const again = await runScoped(asDb(tx), ctx, (s) =>
        importStatement(s, {
          bankAccountId: account.id,
          fileName: "nov-again.csv",
          rows,
          mapping,
        }),
      );
      expect(again.import).toMatchObject({ lineCount: 0, duplicateCount: 3 });
      const lines = await tx
        .select()
        .from(schema.bankStatementLines)
        .where(eq(schema.bankStatementLines.bankAccountId, account.id));
      expect(lines.map((l) => l.creditAmount).sort()).toEqual(
        [12_636_000, 4_500_000, 4_500_000].sort(),
      );
      expect(lines.every((l) => l.matchStatus === "unmatched")).toBe(true);
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          addBankAccount(s, {
            billingEntityId: a.entity.id,
            bankName: "HDFC Bank",
            accountLast4: "1234",
          }),
        ),
      ).rejects.toBeInstanceOf(ImportError);
    });
  });

  it("refuses a file without the saved columns", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      const account = await runScoped(asDb(tx), ctx, (s) =>
        addBankAccount(s, {
          billingEntityId: a.entity.id,
          bankName: "HDFC Bank",
          accountLast4: "1234",
        }),
      );
      await expect(
        runScoped(asDb(tx), ctx, (s) =>
          importStatement(s, {
            bankAccountId: account.id,
            fileName: "x.csv",
            rows: [["Name", "Phone"]],
            mapping,
          }),
        ),
      ).rejects.toThrow(/no row with the columns/);
    });
  });

  it("lines can't be deleted or changed apart from their match", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await runScoped(asDb(tx), ctx, async (s) => {
        const account = await addBankAccount(s, {
          billingEntityId: a.entity.id,
          bankName: "HDFC Bank",
          accountLast4: "1234",
        });
        await importStatement(s, {
          bankAccountId: account.id,
          fileName: "nov.csv",
          rows,
          mapping,
        });
      });
      await tx.execute(sql`reset role`);
      await tx
        .update(schema.bankStatementLines)
        .set({ matchStatus: "ignored" });
      await expect(
        tx.update(schema.bankStatementLines).set({ creditAmount: 1 }),
      ).rejects.toThrow();
    });
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await runScoped(asDb(tx), ctx, async (s) => {
        const account = await addBankAccount(s, {
          billingEntityId: a.entity.id,
          bankName: "HDFC Bank",
          accountLast4: "1234",
        });
        await importStatement(s, {
          bankAccountId: account.id,
          fileName: "nov.csv",
          rows,
          mapping,
        });
      });
      await tx.execute(sql`reset role`);
      await expect(tx.delete(schema.bankStatementLines)).rejects.toThrow();
    });
  });

  it("another organization can't see the lines", async () => {
    await inRollback(async (tx) => {
      const a = await seedOrg(tx, "A");
      const b = await seedOrg(tx, "B");
      const ctx = { userId: a.userId, organizationId: a.org.id };
      await runScoped(asDb(tx), ctx, async (s) => {
        const account = await addBankAccount(s, {
          billingEntityId: a.entity.id,
          bankName: "HDFC Bank",
          accountLast4: "1234",
        });
        await importStatement(s, {
          bankAccountId: account.id,
          fileName: "nov.csv",
          rows,
          mapping,
        });
      });
      await tx.execute(sql`reset role`);
      await actAs(tx, b.userId);
      expect(await tx.select().from(schema.bankStatementLines)).toHaveLength(0);
      expect(await tx.select().from(schema.bankAccounts)).toHaveLength(0);
    });
  });
});
