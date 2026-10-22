import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Tenants" };

export default function TenantsPage() {
  return (
    <PageHeader
      title="Tenants"
      description="Everyone who rents from you, with their contacts and what is unpaid."
    />
  );
}
