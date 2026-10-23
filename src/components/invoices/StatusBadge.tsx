import { Badge } from "@/components/ui/field";
import { shownStatus, type InvoiceStatus } from "@/lib/invoices/status";
import { INVOICE_STATUS } from "./status";

/** An invoice's status, "Overdue" worked out from its due date (src/lib/invoices/status.ts). */
export function InvoiceStatusBadge({
  invoice,
  today,
}: {
  invoice: {
    status: InvoiceStatus;
    dueDate: string;
    outstandingPaise?: number;
  };
  today: string;
}) {
  const { label, tone } = INVOICE_STATUS[shownStatus(invoice, today)];
  return <Badge tone={tone}>{label}</Badge>;
}
