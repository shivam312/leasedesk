import { addDays, addMonths, compareDates, maxDate, minDate } from "./dates";
import type { PlainDate } from "./dates";
import { formatDate } from "@/lib/format";
import { withChargeDefaults } from "./charges";
import type { BillingSettings, Charge, LeaseTerms } from "./types";

/**
 * Rent commencement = lease start + rent-free period
 * (docs/BILLING_RULES.md, section 4).
 */
export function rentCommencement(
  lease: LeaseTerms,
  settings: Pick<BillingSettings, "monthEndRule">,
): {
  date: PlainDate;
  steps: string[];
} {
  const { rentFreeMonths, rentFreeDays } = lease;
  if (rentFreeMonths && rentFreeDays) {
    throw new Error(
      `Lease ${lease.id} has both rent-free months and rent-free days; set one`,
    );
  }
  assertWholeNonNegative(rentFreeMonths, "rent-free months", lease.id);
  assertWholeNonNegative(rentFreeDays, "rent-free days", lease.id);

  const steps = [`Lease starts on ${formatDate(lease.startDate)}`];
  let date = lease.startDate;
  if (rentFreeMonths) {
    date = addMonths(lease.startDate, rentFreeMonths, settings.monthEndRule);
    steps.push(
      `${rentFreeMonths} rent-free ${rentFreeMonths === 1 ? "month" : "months"}`,
    );
  } else if (rentFreeDays) {
    date = addDays(lease.startDate, rentFreeDays);
    steps.push(
      `${rentFreeDays} rent-free ${rentFreeDays === 1 ? "day" : "days"}`,
    );
  }
  steps.push(`Rent starts on ${formatDate(date)}`);
  return { date, steps };
}

/**
 * The dates a charge can be billed for, inclusive: inside the lease, inside
 * the charge's own dates, and from rent commencement if the charge is waived
 * during the rent-free period. `null` when nothing is billable.
 */
export function chargeBillingWindow(
  charge: Charge,
  lease: LeaseTerms,
  settings: Pick<BillingSettings, "monthEndRule">,
): { from: PlainDate; to: PlainDate } | null {
  if (compareDates(lease.endDate, lease.startDate) < 0) {
    throw new Error(`Lease ${lease.id} ends before it starts`);
  }
  const { waivedDuringRentFree } = withChargeDefaults(charge);
  let from = maxDate(lease.startDate, charge.startDate);
  if (waivedDuringRentFree)
    from = maxDate(from, rentCommencement(lease, settings).date);
  const to = charge.endDate
    ? minDate(charge.endDate, lease.endDate)
    : lease.endDate;
  return compareDates(from, to) <= 0 ? { from, to } : null;
}

function assertWholeNonNegative(
  value: number | undefined,
  name: string,
  leaseId: string,
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(
      `Lease ${leaseId}: ${name} must be a whole number ≥ 0, got ${value}`,
    );
  }
}
