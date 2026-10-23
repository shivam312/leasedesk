// Validation for the first steps of the lease form: tenant and units, then
// dates and the rent-free period (docs/PRODUCT_PLAN.md, lease setup).
// Messages are shown as they are.

import { z } from "zod";
import { compareDates, parseDate, type PlainDate } from "@/lib/billing/dates";

const isPlainDate = (s: string) => {
  try {
    parseDate(s);
    return true;
  } catch {
    return false;
  }
};

const requiredDate = (message: string) =>
  z.string().trim().refine(isPlainDate, message);

const optionalDate = (message: string) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .refine((s) => s === null || isPlainDate(s), message);

const wholeNumber = (message: string, max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .refine((s) => s === null || (/^\d+$/.test(s) && Number(s) <= max), message)
    .transform((s) => (s === null ? null : Number(s)));

/** Step 1: who the lease is with and which units it covers. */
export const partiesSchema = z.object({
  tenantId: z.uuid("Choose the tenant."),
  buildingId: z.uuid("Choose the building."),
  unitIds: z
    .array(z.uuid())
    .min(1, "Choose at least one unit.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Choose each unit once.",
    ),
  areaBasis: z.enum(["carpet", "chargeable"]),
});

/** Step 2: dates and the rent-free (fit-out) period. */
export const datesSchema = z
  .object({
    startDate: requiredDate("Enter the date the lease starts."),
    endDate: requiredDate("Enter the last day of the lease."),
    lockInEndDate: optionalDate(
      "Enter the lock-in end date, or leave it blank.",
    ),
    noticePeriodMonths: wholeNumber(
      "Enter the notice period in whole months, like 3.",
      120,
    ),
    rentFree: z.enum(["none", "months", "days"]),
    rentFreeLength: wholeNumber(
      "Enter the rent-free period as a whole number.",
      3650,
    ),
  })
  .superRefine((v, ctx) => {
    // A field that isn't a date already has its own message.
    if (
      !isPlainDate(v.startDate) ||
      !isPlainDate(v.endDate) ||
      (v.lockInEndDate !== null && !isPlainDate(v.lockInEndDate))
    )
      return;
    if (compareDates(v.endDate, v.startDate) < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The lease can't end before it starts.",
      });
    }
    if (
      v.lockInEndDate !== null &&
      (compareDates(v.lockInEndDate, v.startDate) < 0 ||
        compareDates(v.lockInEndDate, v.endDate) > 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["lockInEndDate"],
        message: "The lock-in must end between the lease start and end.",
      });
    }
    if (v.rentFree !== "none" && !v.rentFreeLength) {
      ctx.addIssue({
        code: "custom",
        path: ["rentFreeLength"],
        message: `Enter how many rent-free ${v.rentFree}.`,
      });
    }
  })
  .transform(({ rentFree, rentFreeLength, ...rest }) => ({
    ...rest,
    rentFreeMonths: rentFree === "months" ? (rentFreeLength ?? 0) : 0,
    rentFreeDays: rentFree === "days" ? (rentFreeLength ?? 0) : 0,
  }));

export type LeaseDates = z.output<typeof datesSchema>;

/** A lease that already holds a unit, for the overlap check. */
export type UnitBooking = {
  leaseId: string;
  unitId: string;
  startDate: PlainDate;
  endDate: PlainDate;
};

/**
 * Units of `lease` already in another lease with overlapping dates
 * (docs/DATA_MODEL.md invariant: a unit can't be in two active leases at once).
 * Pass the bookings of active and in-notice leases; the lease being edited
 * and the version it renews are ignored.
 */
export function unitClashes(
  lease: {
    id?: string;
    replacesLeaseId?: string | null;
    unitIds: string[];
    startDate: PlainDate;
    endDate: PlainDate;
  },
  bookings: UnitBooking[],
): UnitBooking[] {
  return bookings.filter(
    (b) =>
      b.leaseId !== lease.id &&
      b.leaseId !== lease.replacesLeaseId &&
      lease.unitIds.includes(b.unitId) &&
      compareDates(b.startDate, lease.endDate) <= 0 &&
      compareDates(lease.startDate, b.endDate) <= 0,
  );
}
