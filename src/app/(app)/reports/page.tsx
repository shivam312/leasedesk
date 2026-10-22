import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <PageHeader
      title="Reports"
      description="Rent roll, unpaid rent, GST and TDS summaries, ready to export."
    />
  );
}
