// A tenant's opening balance (D-028: A; BILLING_RULES section 11): what they
// already owed when the landlord started on LeaseDesk. One per tenant,
// typed on the tenant page or imported. It can't be changed while a payment
// is applied to it: reverse that payment, and then it can be put right
// (drizzle/0036). It can be removed only if no payment ever touched it (the
// database refuses both too).

import { eq, sum } from "drizzle-orm";
import { compareDates, type PlainDate } from "@/lib/billing/dates";
import {
  deleteLogged,
  insertLogged,
  updateLogged,
} from "@/lib/db/activity-log";
import {
  openingBalances,
  paymentAllocations,
  reminders,
  tenants,
} from "@/lib/db/schema";
import { paiseSum } from "@/lib/db/rows";
import type { Scoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { lockTenantMoney, openingBalanceOf, PaymentError } from "./payments";

export type OpeningBalanceInput = {
  tenantId: string;
  asOnDate: PlainDate;
  amountPaise: number;
  note: string | null;
};

/**
 * What payments have applied to this opening balance, net of reversals, and
 * whether any ever touched it.
 */
async function applied(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({
      net: sum(paymentAllocations.amountSettled).mapWith(paiseSum),
    })
    .from(paymentAllocations)
    .where(
      s.where(paymentAllocations, eq(paymentAllocations.openingBalanceId, id)),
    );
  const [any] = await s.tx
    .select({ id: paymentAllocations.id })
    .from(paymentAllocations)
    .where(
      s.where(paymentAllocations, eq(paymentAllocations.openingBalanceId, id)),
    )
    .limit(1);
  return { netPaise: row?.net ?? 0, ever: Boolean(any) };
}

/** Locked while money is applied to it; a reversal unlocks it. */
async function isLocked(s: Scoped, id: string) {
  return (await applied(s, id)).netPaise !== 0;
}

const LOCKED =
  "A payment has been applied to this opening balance, so it can't be changed. Reverse that payment first if it was wrong.";

/** Enter or change a tenant's opening balance. */
export async function setOpeningBalance(
  s: Scoped,
  input: OpeningBalanceInput,
  today: PlainDate,
) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new PaymentError("The opening balance must be more than ₹0.");
  if (compareDates(input.asOnDate, today) > 0)
    throw new PaymentError(
      `The "as on" date can't be after today (${formatDate(today)}).`,
    );
  const [tenant] = await s.tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(s.where(tenants, eq(tenants.id, input.tenantId)));
  if (!tenant) throw new PaymentError("That tenant couldn't be found.");
  await lockTenantMoney(s, input.tenantId);
  const existing = await openingBalanceOf(s, input.tenantId);
  const values = {
    asOnDate: input.asOnDate,
    amount: input.amountPaise,
    note: input.note,
  };
  if (!existing)
    return insertLogged(s, openingBalances, {
      tenantId: input.tenantId,
      ...values,
      createdBy: s.userId,
    });
  if (await isLocked(s, existing.id)) throw new PaymentError(LOCKED);
  return (
    (await updateLogged(s, openingBalances, existing.id, values)) ?? existing
  );
}

/** Remove a tenant's opening balance, if no payment has touched it. */
export async function removeOpeningBalance(s: Scoped, tenantId: string) {
  await lockTenantMoney(s, tenantId);
  const existing = await openingBalanceOf(s, tenantId);
  if (!existing) return;
  const { netPaise, ever } = await applied(s, existing.id);
  if (netPaise !== 0) throw new PaymentError(LOCKED);
  if (ever)
    throw new PaymentError(
      "A payment was once applied to this opening balance, so it stays on record. Change the amount instead if it was wrong.",
    );
  const [reminded] = await s.tx
    .select({ id: reminders.id })
    .from(reminders)
    .where(s.where(reminders, eq(reminders.openingBalanceId, existing.id)))
    .limit(1);
  if (reminded)
    throw new PaymentError(
      "The tenant has been reminded about this opening balance, so it can't be removed. Change the amount instead if it was wrong.",
    );
  await deleteLogged(s, openingBalances, existing.id);
}

/** A tenant's opening balance and whether it can still be changed. */
export async function openingBalanceFor(s: Scoped, tenantId: string) {
  const row = await openingBalanceOf(s, tenantId);
  if (!row) return null;
  const { netPaise, ever } = await applied(s, row.id);
  return { ...row, locked: netPaise !== 0, removable: !ever };
}
