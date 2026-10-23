// Bank accounts and statement imports. The browser reads the file into rows
// (csv.ts) so the user can check the columns; the server reads the rows
// again with the same pure code (statement.ts), saves the credit lines it
// hasn't seen before, and remembers the columns for the account.

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { insertLogged, logActivity, updateLogged } from "@/lib/db/activity-log";
import {
  bankAccounts,
  bankStatementImports,
  bankStatementLines,
  billingEntities,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { refreshSuggestions } from "./match";
import { readStatement, type ColumnMapping } from "./statement";

/** A refusal with a message to show as it is. */
export class ImportError extends Error {}

export async function listBankAccounts(s: Scoped) {
  return s.tx
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountLast4: bankAccounts.accountLast4,
      columnMapping: bankAccounts.columnMapping,
      entityName: billingEntities.legalName,
    })
    .from(bankAccounts)
    .innerJoin(
      billingEntities,
      eq(billingEntities.id, bankAccounts.billingEntityId),
    )
    .where(s.where(bankAccounts))
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.accountLast4));
}

export async function addBankAccount(
  s: Scoped,
  input: { billingEntityId: string; bankName: string; accountLast4: string },
) {
  const [existing] = await s.tx
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(
      s.where(
        bankAccounts,
        eq(bankAccounts.billingEntityId, input.billingEntityId),
        eq(bankAccounts.bankName, input.bankName),
        eq(bankAccounts.accountLast4, input.accountLast4),
      ),
    );
  if (existing)
    throw new ImportError(
      `${input.bankName} account ending ${input.accountLast4} is already added.`,
    );
  return insertLogged(s, bankAccounts, input);
}

/**
 * Save a statement's credit lines that aren't already imported for this
 * account, and the columns used, for next time. One activity entry for the
 * import (with its counts) rather than one per line.
 */
export async function importStatement(
  s: Scoped,
  input: {
    bankAccountId: string;
    fileName: string;
    rows: string[][];
    mapping: ColumnMapping;
  },
) {
  const [account] = await s.tx
    .select()
    .from(bankAccounts)
    .where(s.where(bankAccounts, eq(bankAccounts.id, input.bankAccountId)))
    .for("update");
  if (!account) throw new ImportError("That bank account couldn't be found.");
  const read = readStatement(input.rows, input.mapping);
  if ("error" in read) throw new ImportError(read.error);

  const fingerprints = read.lines.map((l) => l.fingerprint);
  const known = new Set<string>();
  for (let i = 0; i < fingerprints.length; i += 500) {
    const rows = await s.tx
      .select({ fingerprint: bankStatementLines.fingerprint })
      .from(bankStatementLines)
      .where(
        s.where(
          bankStatementLines,
          eq(bankStatementLines.bankAccountId, account.id),
          inArray(
            bankStatementLines.fingerprint,
            fingerprints.slice(i, i + 500),
          ),
        ),
      );
    for (const r of rows) known.add(r.fingerprint);
  }
  const fresh = read.lines.filter((l) => !known.has(l.fingerprint));

  const [imported] = await s.tx
    .insert(bankStatementImports)
    .values(
      s.values({
        bankAccountId: account.id,
        fileName: input.fileName,
        periodStart: read.periodStart,
        periodEnd: read.periodEnd,
        lineCount: fresh.length,
        duplicateCount: read.lines.length - fresh.length,
        debitCount: read.debits,
        importedBy: s.userId,
      }),
    )
    .returning();
  if (!imported) throw new Error("The import wasn't saved");
  for (let i = 0; i < fresh.length; i += 500)
    await s.tx.insert(bankStatementLines).values(
      fresh.slice(i, i + 500).map((l) =>
        s.values({
          bankAccountId: account.id,
          importId: imported.id,
          rowNumber: l.row,
          date: l.date,
          description: l.description,
          reference: l.reference,
          creditAmount: l.creditPaise,
          fingerprint: l.fingerprint,
        }),
      ),
    );
  await logActivity(s, {
    entityType: "bank_statement_imports",
    entityId: imported.id,
    action: "create",
    after: { ...imported, problems: read.problems },
  });
  await refreshSuggestions(s);
  if (JSON.stringify(account.columnMapping) !== JSON.stringify(input.mapping))
    await updateLogged(s, bankAccounts, account.id, {
      columnMapping: input.mapping,
    });
  return { import: imported, problems: read.problems };
}

/** Recent imports, newest first, with their account. */
export async function recentImports(s: Scoped, limit = 20) {
  return s.tx
    .select({
      import: bankStatementImports,
      bankName: bankAccounts.bankName,
      accountLast4: bankAccounts.accountLast4,
    })
    .from(bankStatementImports)
    .innerJoin(
      bankAccounts,
      eq(bankAccounts.id, bankStatementImports.bankAccountId),
    )
    .where(s.where(bankStatementImports))
    .orderBy(desc(bankStatementImports.createdAt))
    .limit(limit);
}

/** One import with its account and credit lines, in file order. */
export async function getImport(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({
      import: bankStatementImports,
      bankName: bankAccounts.bankName,
      accountLast4: bankAccounts.accountLast4,
    })
    .from(bankStatementImports)
    .innerJoin(
      bankAccounts,
      eq(bankAccounts.id, bankStatementImports.bankAccountId),
    )
    .where(s.where(bankStatementImports, eq(bankStatementImports.id, id)));
  if (!row) return null;
  const lines = await s.tx
    .select()
    .from(bankStatementLines)
    .where(
      s.where(bankStatementLines, and(eq(bankStatementLines.importId, id))),
    )
    .orderBy(asc(bankStatementLines.rowNumber));
  return { ...row, lines };
}
