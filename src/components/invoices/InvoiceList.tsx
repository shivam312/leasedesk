import Link from "next/link";
import { formatDate, formatINR } from "@/lib/format";
import { InvoiceStatusBadge } from "./StatusBadge";
import type { InvoiceStatus } from "./status";

export interface InvoiceRow {
  id: string;
  status: InvoiceStatus;
  number: string | null;
  tenantName: string;
  buildingName: string;
  periodStart: string;
  periodEnd: string;
  grandTotal: number;
  dueDate: string;
}

/** A month's invoices: cards on phones, a table from 768px. */
export function InvoiceList({
  invoices,
  today,
}: {
  invoices: InvoiceRow[];
  today: string;
}) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 font-normal">Tenant</th>
            <th className="py-2 font-normal">Building</th>
            <th className="py-2 font-normal">Period</th>
            <th className="py-2 font-normal">Due</th>
            <th className="py-2 text-right font-normal">Total</th>
            <th className="py-2 pl-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id} className="border-t hover:bg-accent">
              <td className="max-w-xs py-2 break-words">
                <Link
                  href={`/billing/invoices/${i.id}`}
                  className="font-medium hover:underline"
                >
                  {i.tenantName}
                </Link>
                {i.number && (
                  <span className="block text-muted-foreground">
                    {i.number}
                  </span>
                )}
              </td>
              <td className="py-2">{i.buildingName}</td>
              <td className="py-2 tabular-nums">
                {formatDate(i.periodStart)} to {formatDate(i.periodEnd)}
              </td>
              <td className="py-2 tabular-nums">{formatDate(i.dueDate)}</td>
              <td className="py-2 text-right tabular-nums">
                {formatINR(i.grandTotal)}
              </td>
              <td className="py-2 pl-4">
                <InvoiceStatusBadge invoice={i} today={today} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-2 md:hidden">
        {invoices.map((i) => (
          <li key={i.id}>
            <Link
              href={`/billing/invoices/${i.id}`}
              className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-accent"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium break-words">{i.tenantName}</span>
                <span className="shrink-0 tabular-nums">
                  {formatINR(i.grandTotal)}
                </span>
              </span>
              <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="min-w-0 break-words">
                  {i.buildingName} · {formatDate(i.periodStart)} to{" "}
                  {formatDate(i.periodEnd)} · due {formatDate(i.dueDate)}
                </span>
                <span className="shrink-0">
                  <InvoiceStatusBadge invoice={i} today={today} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
