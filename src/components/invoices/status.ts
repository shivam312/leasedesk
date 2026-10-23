// Invoice statuses in the glossary's words (docs/UX_PRINCIPLES.md).

import type { InvoiceStatus } from "@/lib/invoices/status";

export type { InvoiceStatus };

export const INVOICE_STATUS: Record<
  InvoiceStatus,
  { label: string; tone: "neutral" | "good" | "warn" | "bad" }
> = {
  draft: { label: "Not sent yet", tone: "warn" },
  sent: { label: "Sent", tone: "neutral" },
  part_paid: { label: "Part paid", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
  overdue: { label: "Overdue", tone: "bad" },
  cancelled: { label: "Credit note issued", tone: "neutral" },
};
