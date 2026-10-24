// The security deposit ledger on a lease (deposit_entries): read it, and add
// an entry: received, refunded or forfeited. Using the deposit for unpaid
// rent ("adjusted") waits on D-034: done as a payment it would take the
// tenant's TDS out of the deposit twice and reach Tally as money banked.

import { asc, eq } from "drizzle-orm";
import type { PlainDate } from "@/lib/billing/dates";
import {
  depositHeld,
  depositProblem,
  type DepositEntryKind,
} from "@/lib/billing/deposit";
import { insertLogged } from "@/lib/db/activity-log";
import { depositEntries, leases } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

export class DepositError extends Error {}

export async function depositLedger(s: Scoped, leaseId: string) {
  const entries = await s.tx
    .select()
    .from(depositEntries)
    .where(s.where(depositEntries, eq(depositEntries.leaseId, leaseId)))
    .orderBy(asc(depositEntries.date), asc(depositEntries.createdAt));
  return { entries, heldPaise: depositHeld(entries) };
}

export async function recordDepositEntry(
  s: Scoped,
  input: {
    leaseId: string;
    kind: DepositEntryKind;
    date: PlainDate;
    amountPaise: number;
    reference: string | null;
    note: string | null;
  },
  today: PlainDate,
) {
  if (input.date > today)
    throw new DepositError("The date can't be after today.");
  if (input.kind === "adjusted")
    throw new DepositError(
      "Using the deposit for unpaid rent isn't available yet. Record a refund for what you give back, and the dues stay on the tenant's invoices.",
    );
  // One change to a lease's deposit at a time.
  const [lease] = await s.tx
    .select({ id: leases.id, tenantId: leases.tenantId })
    .from(leases)
    .where(s.where(leases, eq(leases.id, input.leaseId)))
    .for("update");
  if (!lease) throw new DepositError("That lease couldn't be found.");
  const { entries } = await depositLedger(s, input.leaseId);
  const problem = depositProblem(entries, input.kind, input.amountPaise);
  if (problem) throw new DepositError(problem);
  // Nothing goes out dated before the deposit came in.
  const firstIn = entries.find((e) => e.kind === "received")?.date;
  if (input.kind !== "received" && firstIn && input.date < firstIn)
    throw new DepositError(
      "That's before the deposit was received. Check the date.",
    );
  return insertLogged(s, depositEntries, {
    leaseId: input.leaseId,
    tenantId: lease.tenantId,
    kind: input.kind,
    date: input.date,
    amount: input.amountPaise,
    reference: input.reference,
    note: input.note,
    paymentId: null,
    createdBy: s.userId,
  });
}
