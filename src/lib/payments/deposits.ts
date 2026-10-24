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
  // Nothing goes out beyond what was held on that date.
  const problem = depositProblem(
    entries,
    input.kind,
    input.amountPaise,
    input.date,
  );
  if (problem) throw new DepositError(problem);
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

/** Whether a lease can record its deposit as already held (recordDepositHeld). */
export function canRecordHeld(lease: {
  status: string;
  replacesLeaseId: string | null;
  depositAmount: number;
}) {
  // A renewal's deposit is the earlier version's, already on its ledger.
  return (
    lease.depositAmount > 0 &&
    lease.replacesLeaseId === null &&
    ["active", "in_notice", "expired"].includes(lease.status)
  );
}

/**
 * For a lease that started before the deposit ledger: the deposit the lease
 * agrees, received on the lease start (or today, for a lease that hasn't
 * started). Only while the lease has no deposit entries, and not for a
 * renewal (its deposit is on the earlier version).
 */
export async function recordDepositHeld(
  s: Scoped,
  leaseId: string,
  today: PlainDate,
) {
  // Lock the lease first, so two taps can't both find no entries.
  const [lease] = await s.tx
    .select({
      startDate: leases.startDate,
      depositAmount: leases.depositAmount,
      status: leases.status,
      replacesLeaseId: leases.replacesLeaseId,
    })
    .from(leases)
    .where(s.where(leases, eq(leases.id, leaseId)))
    .for("update");
  if (!lease) throw new DepositError("That lease couldn't be found.");
  if (lease.depositAmount <= 0)
    throw new DepositError("The lease agrees no deposit.");
  if (!canRecordHeld(lease))
    throw new DepositError(
      "This lease continues an earlier one (or has ended early), so its deposit is on that lease's record. Use “Record a deposit entry” if something changed.",
    );
  const { entries } = await depositLedger(s, leaseId);
  if (entries.length > 0)
    throw new DepositError(
      "This lease already has deposit entries. Record any change with “Record a deposit entry”.",
    );
  return recordDepositEntry(
    s,
    {
      leaseId,
      kind: "received",
      date: lease.startDate < today ? lease.startDate : today,
      amountPaise: lease.depositAmount,
      reference: null,
      note: "Held before LeaseDesk",
    },
    today,
  );
}
