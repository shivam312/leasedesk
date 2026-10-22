import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <PageHeader
      title="Today"
      description="What needs doing this month: invoices to send, unpaid tenants to chase, and rent increases and lease expiries coming up."
    />
  );
}
