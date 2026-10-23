import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { REPORTS } from "@/lib/reports/registry";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Rent roll, vacancy, money received, unpaid rent, and GST and TDS summaries."
      />
      <ul className="grid max-w-3xl gap-3 md:grid-cols-2">
        {REPORTS.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/reports/${r.slug}`}
              className="flex h-full flex-col gap-1 rounded-lg border p-4 hover:bg-muted"
            >
              <span className="font-medium">{r.title}</span>
              <span className="text-sm text-muted-foreground">
                {r.description}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/reports/tally"
            className="flex h-full flex-col gap-1 rounded-lg border p-4 hover:bg-muted"
          >
            <span className="font-medium">Tally export</span>
            <span className="text-sm text-muted-foreground">
              Invoices, credit notes and payments as a file your accountant
              imports into TallyPrime, or as Excel.
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}
