// A tenant's opening balance (D-028: A; BILLING_RULES section 11): what they
// already owed when the landlord started on LeaseDesk. One per tenant,
// typed on the tenant page or imported. It can be changed or removed only
// until a payment is applied to it (the database refuses it too,
// drizzle/0033); after that a mistake is corrected with a payment reversal.

import { and, eq } from "drizzle-orm";
import { compareDates, type PlainDate } from "@/lib/billing/dates";
import {
  deleteLogged,
  insertLogged,
  updateLogged,
} from "@/lib/db/activity-log";
import { openingBalances, paymentAllocations, tenants } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { lockTenantMoney, openingBalanceOf, PaymentError } from "./payments";

export type OpeningBalanceInput = {
  tenantId: string;
  asOnDate: PlainDate;
  amountPaise: number;
  note: string | null;
};

/** Whether a payment has ever been applied to this opening balance. */
async function isTouched(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({ id: paymentAllocations.id })
    .from(paymentAllocations)
    .where(
      s.where(
        paymentAllocations,
        and(eq(paymentAllocations.openingBalanceId, id)),
      ),
    )
    .limit(1);
  return Boolean(row);
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
  if (await isTouched(s, existing.id)) throw new PaymentError(LOCKED);
  return (
    (await updateLogged(s, openingBalances, existing.id, values)) ?? existing
  );
}

/** Remove a tenant's opening balance, if no payment has touched it. */
export async function removeOpeningBalance(s: Scoped, tenantId: string) {
  await lockTenantMoney(s, tenantId);
  const existing = await openingBalanceOf(s, tenantId);
  if (!existing) return;
  if (await isTouched(s, existing.id)) throw new PaymentError(LOCKED);
  await deleteLogged(s, openingBalances, existing.id);
}

/** A tenant's opening balance and whether it can still be changed. */
export async function openingBalanceFor(s: Scoped, tenantId: string) {
  const row = await openingBalanceOf(s, tenantId);
  return row ? { ...row, locked: await isTouched(s, row.id) } : null;
}
