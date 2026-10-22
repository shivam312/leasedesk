import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Leases" };

export default function LeasesPage() {
  return (
    <PageHeader
      title="Leases"
      description="Your buildings and units, and every lease: who rents what, the rent, and when it ends."
    />
  );
}
