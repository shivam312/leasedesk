import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <PageHeader
      title="Reports"
      description="Rent roll (every lease and its rent), unpaid rent, and GST and TDS summaries, ready to export."
    />
  );
}
