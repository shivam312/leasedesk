import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Leases" };

export default function LeasesPage() {
  return (
    <>
      <PageHeader
        title="Leases"
        description="Your buildings and units, and every lease: who rents what, the rent, and when it ends."
      />
      <Link
        href="/leases/buildings"
        className="flex max-w-2xl items-center justify-between gap-4 rounded-lg border p-4 hover:bg-accent"
      >
        <span>
          <span className="block font-medium">Buildings and units</span>
          <span className="block text-sm text-muted-foreground">
            Add buildings, floors and units before adding leases.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </>
  );
}
