"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";
import {
  allocatePayment,
  checkAllocation,
  suggestTds,
  type OpenInvoice,
} from "@/lib/billing/allocation";
import { formatDate, formatINR } from "@/lib/format";
import { amountToPaise, paiseToField } from "@/lib/invoices/credit-note-form";
import { APPLY_FIELD, PAYMENT_MODES } from "@/lib/payments/forms";

export type PaymentFormInvoice = OpenInvoice & {
  invoiceDate: string;
  grandTotalPaise: number;
};

/**
 * Record a payment: what arrived, the TDS the tenant kept, and which
 * invoices it pays. TDS and the invoices are filled in as you type, by the
 * same engine the server checks with (oldest invoice first); both can be
 * changed before saving.
 */
export function PaymentForm({
  tenantId,
  invoices,
  tolerancePaise,
  today,
  action,
}: {
  tenantId: string;
  invoices: PaymentFormInvoice[];
  tolerancePaise: number;
  today: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? {};
  const base = useId();
  const [received, setReceived] = useState(v.amountReceived ?? "");
  const [tdsText, setTdsText] = useState<string | null>(v.tds ?? null);
  const [apply, setApply] = useState<Record<string, string> | null>(() => {
    const kept = invoices.filter((i) => v[`${APPLY_FIELD}${i.id}`] != null);
    return kept.length > 0
      ? Object.fromEntries(
          invoices.map((i) => [i.id, v[`${APPLY_FIELD}${i.id}`] ?? "0"]),
        )
      : null;
  });
  const [showApply, setShowApply] = useState(apply !== null);

  const receivedPaise = amountToPaise(received);
  const validReceived = receivedPaise !== null && receivedPaise > 0;
  const suggestion = validReceived
    ? suggestTds({
        receivedPaise,
        invoices,
        settings: { tdsTolerancePaise: tolerancePaise },
      })
    : null;
  const tdsPaise =
    tdsText === null ? (suggestion?.tdsPaise ?? 0) : amountToPaise(tdsText);
  const auto =
    validReceived && tdsPaise !== null
      ? allocatePayment({ receivedPaise, tdsPaise, invoices })
      : null;
  const autoApply = (id: string) =>
    auto?.allocations.find((a) => a.invoiceId === id)?.amountPaise ?? 0;
  const applyField = (id: string) =>
    apply ? (apply[id] ?? "0") : paiseToField(autoApply(id));
  const allocations = invoices.map((i) => ({
    invoiceId: i.id,
    amountPaise: amountToPaise(applyField(i.id)),
  }));
  const badAmount = allocations.some((a) => a.amountPaise === null);
  const chosen = allocations.filter(
    (a): a is { invoiceId: string; amountPaise: number } =>
      Boolean(a.amountPaise),
  );
  const problem =
    !validReceived || tdsPaise === null
      ? null
      : badAmount
        ? "Enter amounts in rupees, like 5000 or 5000.50."
        : checkAllocation({
            receivedPaise,
            tdsPaise,
            allocations: chosen,
            invoices,
          });
  const applied = chosen.reduce((sum, a) => sum + a.amountPaise, 0);
  const credit =
    validReceived && tdsPaise !== null ? receivedPaise + tdsPaise - applied : 0;
  // A typo in the TDS field becomes a wrong TDS record: warn (not block)
  // when it's more than the invoices paid expect, beyond the tolerance.
  const expectedOnChosen = chosen.reduce(
    (sum, a) =>
      sum + (invoices.find((i) => i.id === a.invoiceId)?.expectedTdsPaise ?? 0),
    0,
  );
  const tdsWarning =
    !problem &&
    tdsPaise !== null &&
    tdsPaise > expectedOnChosen + tolerancePaise * Math.max(1, chosen.length)
      ? `TDS of ${formatINR(tdsPaise)} is more than the ${formatINR(expectedOnChosen)} expected on the invoices it pays. Check it before recording.`
      : null;

  const field = (name: string, hasHint = false) => ({
    id: `${base}-${name}`,
    name,
    ...errorProps(`${base}-${name}`, state.fieldErrors?.[name], hasHint),
  });

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field
        label="Amount received"
        htmlFor={`${base}-amountReceived`}
        hint="What reached your bank, after any TDS."
        error={state.fieldErrors?.amountReceived}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-muted-foreground">
            ₹
          </span>
          <Input
            {...field("amountReceived", true)}
            inputMode="decimal"
            autoComplete="off"
            required
            className="text-right tabular-nums"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
          />
        </div>
      </Field>

      <Field
        label="TDS deducted"
        htmlFor={`${base}-tds`}
        hint={
          tdsText === null && suggestion
            ? suggestion.tdsPaise > 0
              ? `Worked out from the amount: ${suggestion.explanation.steps.at(-1)}.`
              : suggestion.explanation.steps.at(-1)
            : "The TDS the tenant kept back. Leave empty for none."
        }
        error={state.fieldErrors?.tds}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-muted-foreground">
            ₹
          </span>
          <Input
            {...field("tds", true)}
            inputMode="decimal"
            autoComplete="off"
            className="text-right tabular-nums"
            value={
              tdsText ??
              (suggestion && suggestion.tdsPaise > 0
                ? paiseToField(suggestion.tdsPaise)
                : "")
            }
            onChange={(e) => setTdsText(e.target.value)}
          />
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field
          label="Date received"
          htmlFor={`${base}-receivedDate`}
          error={state.fieldErrors?.receivedDate}
        >
          <Input
            {...field("receivedDate")}
            type="date"
            max={today}
            required
            defaultValue={v.receivedDate ?? today}
          />
        </Field>
        <Field
          label="How they paid"
          htmlFor={`${base}-mode`}
          error={state.fieldErrors?.mode}
        >
          <Select {...field("mode")} defaultValue={v.mode ?? "neft"} required>
            {Object.entries(PAYMENT_MODES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Reference (optional)"
        htmlFor={`${base}-reference`}
        hint="UTR, cheque number or UPI reference."
        error={state.fieldErrors?.reference}
      >
        <Input
          {...field("reference", true)}
          maxLength={60}
          autoComplete="off"
          defaultValue={v.reference ?? ""}
        />
      </Field>
      <Field
        label="Note (optional)"
        htmlFor={`${base}-note`}
        error={state.fieldErrors?.note}
      >
        <Textarea
          {...field("note")}
          rows={2}
          maxLength={200}
          defaultValue={v.note ?? ""}
        />
      </Field>

      <section
        className="flex flex-col gap-3"
        aria-labelledby={`${base}-apply`}
      >
        <h2 id={`${base}-apply`} className="font-medium">
          Apply payment to invoices
        </h2>
        {invoices.length === 0 ? (
          <p className="text-sm">
            This tenant has no unpaid invoices. The payment will be kept as
            credit and can be applied to their next invoice.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {invoices.map((i) => {
                const paise = amountToPaise(applyField(i.id)) ?? 0;
                return (
                  <li
                    key={i.id}
                    className="flex flex-wrap justify-between gap-x-4 border-b py-2"
                  >
                    <span>
                      {i.number}{" "}
                      <span className="text-muted-foreground">
                        dated {formatDate(i.invoiceDate)}, due{" "}
                        {formatDate(i.dueDate)}: {formatINR(i.outstandingPaise)}{" "}
                        left
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {paise > 0
                        ? paise === i.outstandingPaise
                          ? `Pays ${formatINR(paise)} (in full)`
                          : `Pays ${formatINR(paise)}`
                        : "Not paid"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!showApply && (
              <p className="text-sm text-muted-foreground">
                The oldest invoices are paid first.{" "}
                <button
                  type="button"
                  className="min-h-11 underline md:min-h-0"
                  onClick={() => setShowApply(true)}
                >
                  Change how it&apos;s applied
                </button>
              </p>
            )}
            <div className={showApply ? "flex flex-col gap-4" : "hidden"}>
              {invoices.map((i) => {
                const id = `${base}-${i.id}`;
                const name = `${APPLY_FIELD}${i.id}`;
                return (
                  <Field
                    key={i.id}
                    label={`Amount for ${i.number}`}
                    htmlFor={id}
                    hint={`Up to ${formatINR(i.outstandingPaise)}`}
                    error={state.fieldErrors?.[name]}
                  >
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        id={id}
                        name={name}
                        inputMode="decimal"
                        autoComplete="off"
                        className="text-right tabular-nums"
                        value={applyField(i.id)}
                        onChange={(e) =>
                          setApply({
                            ...Object.fromEntries(
                              invoices.map((x) => [x.id, applyField(x.id)]),
                            ),
                            [i.id]: e.target.value,
                          })
                        }
                        {...errorProps(id, state.fieldErrors?.[name], true)}
                      />
                    </div>
                  </Field>
                );
              })}
              {apply && (
                <button
                  type="button"
                  className="min-h-11 self-start text-sm underline md:min-h-0"
                  onClick={() => setApply(null)}
                >
                  Back to oldest first
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section aria-live="polite" className="flex flex-col gap-1 text-sm">
        {tdsWarning && (
          <p className="text-amber-800 dark:text-amber-200">{tdsWarning}</p>
        )}
        {problem ? (
          <p className="text-destructive">{problem}</p>
        ) : validReceived && tdsPaise !== null ? (
          <>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Total paid, including TDS kept back
              </span>
              <span className="tabular-nums">
                {formatINR(receivedPaise + tdsPaise)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Applied to invoices</span>
              <span className="tabular-nums">{formatINR(applied)}</span>
            </p>
            {credit > 0 && (
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Kept as credit for later invoices
                </span>
                <span className="tabular-nums">{formatINR(credit)}</span>
              </p>
            )}
          </>
        ) : null}
      </section>

      <FormMessage message={state.message} tone={state.tone} />
      <div>
        <Button
          type="submit"
          disabled={pending || !validReceived || Boolean(problem)}
          className="h-11 md:h-9"
        >
          {pending
            ? "Recording…"
            : validReceived
              ? `Record payment of ${formatINR(receivedPaise)}`
              : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
