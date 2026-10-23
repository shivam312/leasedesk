// The status an invoice is shown with. "Overdue" isn't stored: nothing sets
// it as the days pass, so it is worked out here from the due date and what's
// still to pay. Every screen that shows an invoice's status uses this.

import { compareDates, type PlainDate } from "@/lib/billing/dates";
import type { invoiceStatus } from "@/lib/db/schema/invoices";

export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];

const UNPAID: readonly InvoiceStatus[] = ["sent", "part_paid", "overdue"];

/** "overdue" once the due date has passed with something left to pay; otherwise the stored status ("overdue" falls back to "sent"). */
export function shownStatus(
  invoice: {
    status: InvoiceStatus;
    dueDate: PlainDate;
    /** What's left to pay, when known; without it, an unpaid status means something is. */
    outstandingPaise?: number;
  },
  today: PlainDate,
): InvoiceStatus {
  const { status, dueDate, outstandingPaise } = invoice;
  if (!UNPAID.includes(status)) return status;
  const owed = outstandingPaise === undefined || outstandingPaise > 0;
  if (owed && compareDates(dueDate, today) < 0) return "overdue";
  return status === "overdue" ? "sent" : status;
}
