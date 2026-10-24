"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";
import { formatDate, formatINR } from "@/lib/format";
import { shownStatus } from "@/lib/invoices/status";
import { cn } from "@/lib/utils";
import { SendSelectedForm } from "./SendForms";
import { InvoiceStatusBadge } from "./StatusBadge";
import { INVOICE_STATUS, type InvoiceStatus } from "./status";

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

/** "Send selected", when drafts can be sent now (owner or accounts, on or after the 1st). */
export type SendSelected = {
  month: string;
  monthLabel: string;
  consequence: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
};

const CHIPS: { key: "all" | InvoiceStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: INVOICE_STATUS.draft.label },
  { key: "overdue", label: INVOICE_STATUS.overdue.label },
  { key: "sent", label: INVOICE_STATUS.sent.label },
  { key: "part_paid", label: INVOICE_STATUS.part_paid.label },
  { key: "paid", label: INVOICE_STATUS.paid.label },
  { key: "cancelled", label: INVOICE_STATUS.cancelled.label },
];

/**
 * A month's invoices: search by tenant, building or number, status chips,
 * and ticks on drafts for "Send selected". Cards on phones, a table from
 * 768px.
 */
export function InvoiceList({
  invoices,
  today,
  send,
}: {
  invoices: InvoiceRow[];
  today: string;
  send?: SendSelected;
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<"all" | InvoiceStatus>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const status = (i: InvoiceRow) => shownStatus(i, today);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (i) =>
        (chip === "all" || shownStatus(i, today) === chip) &&
        [i.tenantName, i.buildingName, i.number]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
  }, [invoices, query, chip, today]);
  const chips = CHIPS.filter(
    (c) => c.key === "all" || invoices.some((i) => status(i) === c.key),
  );
  const selectable = (i: InvoiceRow) => !!send && i.status === "draft";
  const chosen = invoices.filter((i) => picked.has(i.id) && selectable(i));
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pick = (i: InvoiceRow) =>
    selectable(i) ? (
      <input
        type="checkbox"
        className="size-5 md:size-4"
        aria-label={`Select ${i.tenantName}`}
        checked={picked.has(i.id)}
        onChange={() => toggle(i.id)}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          type="search"
          aria-label="Search invoices"
          placeholder="Search by tenant, building or invoice number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-sm"
        />
        {chips.length > 2 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={chip === c.key}
                onClick={() => setChip(c.key)}
                className={cn(
                  "h-11 rounded-full border px-3 text-sm md:h-9",
                  chip === c.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                {c.label} (
                {c.key === "all"
                  ? invoices.length
                  : invoices.filter((i) => status(i) === c.key).length}
                )
              </button>
            ))}
          </div>
        )}
      </div>

      {send && chosen.length > 0 && (
        <SendSelectedForm
          month={send.month}
          monthLabel={send.monthLabel}
          ids={chosen.map((i) => i.id)}
          total={formatINR(chosen.reduce((t, i) => t + i.grandTotal, 0))}
          consequence={send.consequence}
          action={send.action}
        />
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query.trim()
            ? `No invoices match “${query.trim()}”.`
            : "No invoices match."}{" "}
          <button
            type="button"
            className="py-3 underline"
            onClick={() => {
              setQuery("");
              setChip("all");
            }}
          >
            Show all invoices
          </button>
        </p>
      ) : (
        <>
          <table className="hidden w-full text-sm md:table">
            <thead className="text-left text-muted-foreground">
              <tr>
                {send && (
                  <th className="w-8 py-2 font-normal">
                    <span className="sr-only">Select</span>
                  </th>
                )}
                <th className="py-2 font-normal">Tenant</th>
                <th className="py-2 font-normal">Building</th>
                <th className="py-2 font-normal">Period</th>
                <th className="py-2 font-normal">Due</th>
                <th className="py-2 text-right font-normal">Total</th>
                <th className="py-2 pl-4 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-t hover:bg-accent">
                  {send && <td className="py-2">{pick(i)}</td>}
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
            {shown.map((i) => (
              <li key={i.id} className="flex items-start gap-3">
                {selectable(i) && <div className="pt-4">{pick(i)}</div>}
                <Link
                  href={`/billing/invoices/${i.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border p-4 hover:bg-accent"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium break-words">
                      {i.tenantName}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatINR(i.grandTotal)}
                    </span>
                  </span>
                  {i.number && (
                    <span className="text-sm tabular-nums">{i.number}</span>
                  )}
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
      )}
    </div>
  );
}
