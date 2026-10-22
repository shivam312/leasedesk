import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <PageHeader
      title="Billing"
      description="Send this month's invoices, record payments and match payments to invoices."
    />
  );
}
