import Link from "next/link";
import { Badge } from "@/components/ui/field";
import { formatDate, formatINR } from "@/lib/format";
import { PAYMENT_MODES } from "@/lib/payments/forms";
import type { PaymentMode } from "@/lib/payments/payments";

export interface PaymentRow {
  id: string;
  tenantName?: string;
  kind: "payment" | "reversal";
  status: "active" | "reversed";
  receivedDate: string;
  amountReceived: number;
  tdsDeducted: number;
  mode: PaymentMode;
  reference: string | null;
}

function PaymentBadge({ p }: { p: PaymentRow }) {
  if (p.kind === "reversal") return <Badge tone="warn">Reversal</Badge>;
  if (p.status === "reversed") return <Badge>Reversed</Badge>;
  return null;
}

const how = (p: PaymentRow) =>
  [PAYMENT_MODES[p.mode], p.reference].filter(Boolean).join(" · ");

/** Payments: cards on phones, a table from 768px. */
export function PaymentList({ payments }: { payments: PaymentRow[] }) {
  const showTenant = payments.some((p) => p.tenantName);
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 font-normal">Received</th>
            {showTenant && <th className="py-2 font-normal">Tenant</th>}
            <th className="py-2 font-normal">How</th>
            <th className="py-2 text-right font-normal">Amount</th>
            <th className="py-2 text-right font-normal">TDS kept back</th>
            <th className="py-2 pl-4 font-normal">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t hover:bg-accent">
              <td className="py-2 tabular-nums">
                <Link
                  href={`/billing/payments/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {formatDate(p.receivedDate)}
                </Link>
              </td>
              {showTenant && (
                <td className="max-w-xs py-2 break-words">{p.tenantName}</td>
              )}
              <td className="py-2">{how(p)}</td>
              <td className="py-2 text-right tabular-nums">
                {formatINR(p.amountReceived)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {p.tdsDeducted !== 0 ? formatINR(p.tdsDeducted) : "None"}
              </td>
              <td className="py-2 pl-4">
                <PaymentBadge p={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-2 md:hidden">
        {payments.map((p) => (
          <li key={p.id}>
            <Link
              href={`/billing/payments/${p.id}`}
              className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-accent"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium break-words">
                  {p.tenantName ?? formatDate(p.receivedDate)}
                </span>
                <span className="tabular-nums">
                  {formatINR(p.amountReceived)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {p.tenantName && <span>{formatDate(p.receivedDate)}</span>}
                <span>{how(p)}</span>
                {p.tdsDeducted !== 0 && (
                  <span>TDS kept back {formatINR(p.tdsDeducted)}</span>
                )}
                <PaymentBadge p={p} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
