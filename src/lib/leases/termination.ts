// Termination: the tenant leaves on an exit date before the lease's end
// (docs/PRODUCT_PLAN.md, tenant exit). Only future billing changes: the
// lease and its charges end on the exit date, so the final invoice is
// pro-rated to it by the billing engine. Sent invoices are never edited
// (CLAUDE.md rule 5); anything already billed in advance past the exit date
// is refunded with a credit note (M4).

import { compareDates, type PlainDate } from "@/lib/billing/dates";

export type TerminationInput = {
  lease: {
    startDate: PlainDate;
    endDate: PlainDate;
    status:
      "draft" | "active" | "in_notice" | "expired" | "terminated" | "renewed";
  };
  charges: { id: string; startDate: PlainDate; endDate?: PlainDate | null }[];
  criticalDates: {
    id: string;
    date: PlainDate;
    status: "open" | "done" | "snoozed";
  }[];
  exitDate: PlainDate;
  /** Today's date, passed in so this stays pure. */
  today: PlainDate;
};

export type TerminationPlan = {
  /** The tenant's last day: the lease's new end date. */
  endDate: PlainDate;
  /** `in_notice` until the exit date has passed, then `terminated`. */
  status: "in_notice" | "terminated";
  /** Charges whose end date moves to the exit date. */
  shortenCharges: { id: string; endDate: PlainDate }[];
  /** Charges that would only start after the exit: nothing left to bill. */
  chargesNeverBilled: string[];
  /** Open or snoozed critical dates after the exit, to mark done. */
  closeCriticalDates: string[];
};

export function terminationPlan(input: TerminationInput): TerminationPlan {
  const { lease, exitDate, today } = input;
  if (lease.status !== "active" && lease.status !== "in_notice") {
    throw new Error(
      "Only an active lease, or one in notice, can be ended early.",
    );
  }
  if (compareDates(exitDate, lease.startDate) < 0) {
    throw new Error("The exit date can't be before the lease starts.");
  }
  if (compareDates(exitDate, lease.endDate) > 0) {
    throw new Error(
      "The exit date can't be after the lease ends; renew it instead.",
    );
  }

  const shortenCharges: TerminationPlan["shortenCharges"] = [];
  const chargesNeverBilled: string[] = [];
  for (const charge of input.charges) {
    if (compareDates(charge.startDate, exitDate) > 0) {
      chargesNeverBilled.push(charge.id);
    } else if (!charge.endDate || compareDates(charge.endDate, exitDate) > 0) {
      shortenCharges.push({ id: charge.id, endDate: exitDate });
    }
  }

  return {
    endDate: exitDate,
    status: compareDates(exitDate, today) < 0 ? "terminated" : "in_notice",
    shortenCharges,
    chargesNeverBilled,
    closeCriticalDates: input.criticalDates
      .filter((d) => d.status !== "done" && compareDates(d.date, exitDate) > 0)
      .map((d) => d.id),
  };
}
