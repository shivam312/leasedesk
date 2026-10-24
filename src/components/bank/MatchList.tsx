"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";
import { formatDate, formatINR } from "@/lib/format";

export type MatchRow = {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  creditPaise: number;
  account: string;
  tenantId: string | null;
  confidence: number | null;
  invoiceNumbers: string[];
  tdsPaise: number | null;
};

function confidenceBadge(c: number | null) {
  if (c === null) return <Badge tone="warn">No match found</Badge>;
  if (c >= 75) return <Badge tone="good">Likely match</Badge>;
  return <Badge>Possible match</Badge>;
}

/**
 * Match payments: each bank credit with the tenant we think paid it, ticked
 * when we're fairly sure. Change a tenant, untick what's wrong, then record
 * the ticked ones as payments in one go, or set them aside as not rent.
 */
export function MatchList({
  rows,
  tenants,
  confirmAction,
  ignoreAction,
}: {
  rows: MatchRow[];
  tenants: { id: string; name: string }[];
  confirmAction: (state: FormState, form: FormData) => Promise<FormState>;
  ignoreAction: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [confirmed, confirm, confirming] = useActionState(confirmAction, {});
  const [ignored, ignore, ignoring] = useActionState(ignoreAction, {});
  const [ticked, setTicked] = useState<Set<string>>(
    () =>
      new Set(
        rows
          .filter((r) => r.tenantId && (r.confidence ?? 0) >= 75)
          .map((r) => r.id),
      ),
  );
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.tenantId ?? ""])),
  );
  // Search: only the lines shown are counted and recorded.
  const [query, setQuery] = useState("");
  const tenantName = (id: string) =>
    tenants.find((t) => t.id === id)?.name ?? "";
  const q = query
    .trim()
    .toLowerCase()
    .replace(/[₹,\s]/g, "");
  const shown = q
    ? rows.filter((r) =>
        [
          r.description,
          r.reference,
          tenantName(chosen[r.id] ?? r.tenantId ?? ""),
          String(r.creditPaise / 100),
          ...r.invoiceNumbers,
        ]
          .join(" ")
          .toLowerCase()
          .replace(/[₹,\s]/g, "")
          .includes(q),
      )
    : rows;
  const count = [...ticked].filter((id) =>
    shown.some((r) => r.id === id),
  ).length;
  // Rows change after recording; a new row starts with its suggestion.
  const tenantOf = (r: MatchRow) => chosen[r.id] ?? r.tenantId ?? "";
  const missingTenant = shown.some((r) => ticked.has(r.id) && !tenantOf(r));
  const pending = confirming || ignoring;
  const [askIgnore, setAskIgnore] = useState(false);
  const toggleAll = (on: boolean) =>
    setTicked(new Set(on ? shown.map((r) => r.id) : []));

  return (
    <form
      className="flex flex-col gap-4"
      // Enter in a checkbox or list must never record payments.
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))
          e.preventDefault();
      }}
    >
      <FormMessage message={confirmed.message} tone={confirmed.tone} />
      {confirmed.problems && confirmed.problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {confirmed.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <FormMessage message={ignored.message} tone={ignored.tone} />

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background py-2">
        <Button
          type="submit"
          formAction={confirm}
          disabled={pending || count === 0 || missingTenant}
          className="h-11 md:h-9"
        >
          {confirming
            ? "Recording…"
            : `Record ${count} ${count === 1 ? "payment" : "payments"}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || count === 0}
          className="h-11 md:h-9"
          onClick={() => setAskIgnore(true)}
        >
          Mark {count} as not rent
        </Button>
        <button
          type="button"
          className="min-h-11 text-sm underline md:min-h-0"
          onClick={() => toggleAll(count < shown.length)}
        >
          {count < shown.length ? `Tick all ${shown.length}` : "Untick all"}
        </button>
        {count === 0 && (
          <p className="w-full text-sm text-muted-foreground">
            Tick the lines you want to record.
          </p>
        )}
        {missingTenant && (
          <p className="w-full text-sm text-destructive">
            Choose the tenant for every ticked line (marked below).
          </p>
        )}
        {askIgnore && count > 0 && (
          <div
            role="group"
            aria-label="Set lines aside"
            className="flex w-full flex-col gap-2 rounded-lg border p-3"
          >
            <p className="text-sm">
              Set aside {count} {count === 1 ? "line" : "lines"} as not rent?
              They won&apos;t be recorded as payments or suggested again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="outline"
                formAction={(form) => {
                  setAskIgnore(false);
                  ignore(form);
                }}
                className="h-11 md:h-9"
              >
                Set aside {count} {count === 1 ? "line" : "lines"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-9"
                onClick={() => setAskIgnore(false)}
              >
                Go back
              </Button>
            </div>
          </div>
        )}
      </div>

      <Input
        type="search"
        aria-label="Search bank lines"
        placeholder="Search by name, reference, amount or invoice number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="md:max-w-sm"
      />
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No lines match “{query.trim()}”.{" "}
          <button
            type="button"
            className="py-3 underline"
            onClick={() => setQuery("")}
          >
            Show all lines
          </button>
        </p>
      )}
      <ul className="flex flex-col">
        {shown.map((r) => {
          const on = ticked.has(r.id);
          const suggested = tenantOf(r) === r.tenantId && r.tenantId;
          return (
            <li
              key={r.id}
              className="flex flex-col gap-2 border-b py-3 md:flex-row md:items-start md:gap-4"
            >
              <label className="flex min-h-11 items-start gap-3 md:min-h-0 md:flex-1">
                <input
                  type="checkbox"
                  name="line"
                  value={r.id}
                  checked={on}
                  onChange={(e) => {
                    const next = new Set(ticked);
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                    setTicked(next);
                  }}
                  className="mt-1 size-5 md:size-4"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium tabular-nums">
                      {formatINR(r.creditPaise)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(r.date)}
                    </span>
                    {suggested || !tenantOf(r) ? (
                      confidenceBadge(suggested ? r.confidence : null)
                    ) : (
                      <Badge>Chosen by you</Badge>
                    )}
                  </span>
                  <span className="text-sm break-words">
                    {r.description}
                    {r.reference ? ` · ${r.reference}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.account}
                  </span>
                </span>
              </label>
              <div className="flex flex-col gap-1 md:w-72">
                <label className="sr-only" htmlFor={`tenant-${r.id}`}>
                  Tenant who paid {formatINR(r.creditPaise)} on{" "}
                  {formatDate(r.date)}
                </label>
                <Select
                  id={`tenant-${r.id}`}
                  name={`tenant_${r.id}`}
                  value={tenantOf(r)}
                  onChange={(e) =>
                    setChosen({ ...chosen, [r.id]: e.target.value })
                  }
                >
                  <option value="">Choose the tenant</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                {on && !tenantOf(r) ? (
                  <span className="text-xs text-destructive">
                    Choose a tenant
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {suggested && r.invoiceNumbers.length > 0
                      ? `Applied to ${r.invoiceNumbers.join(", ")}${r.tdsPaise ? `, with ${formatINR(r.tdsPaise)} TDS the tenant kept back` : ", no TDS"}.`
                      : tenantOf(r)
                        ? "Applied to their oldest unpaid invoices."
                        : ""}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
