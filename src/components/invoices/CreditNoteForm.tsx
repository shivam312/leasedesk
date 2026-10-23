"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorProps, Field, FormMessage } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { FormState } from "@/lib/auth/forms";
import {
  creditNoteAmounts,
  type CreditableLine,
} from "@/lib/billing/credit-note";
import type { SupplyType } from "@/lib/billing/gst";
import { formatINR } from "@/lib/format";
import { CREDIT_REASONS } from "@/lib/invoices/credit-note-document";
import {
  amountToPaise,
  LINE_FIELD,
  paiseToField,
} from "@/lib/invoices/credit-note-form";

/**
 * Issue a credit note: why, and how much before GST to take off each line
 * (all that is left, to start with). The total with GST is worked out as you
 * type by the same engine the server uses, then confirmed before issuing.
 */
export function CreditNoteForm({
  invoiceId,
  supply,
  roundOff,
  creditedRoundOff,
  lines,
  to,
  dateLabel,
  deadlineLabel,
  action,
}: {
  invoiceId: string;
  supply: SupplyType;
  roundOff: number;
  creditedRoundOff: number;
  lines: CreditableLine[];
  to: string[];
  dateLabel: string;
  deadlineLabel: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const left = (l: CreditableLine) => l.taxablePaise - l.credited.taxable;
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        state.values?.[`${LINE_FIELD}${l.id}`] ?? paiseToField(left(l)),
      ]),
    ),
  );
  const [confirming, setConfirming] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const base = useId();
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  // The same calculation the server makes; null while an amount is invalid.
  let preview: ReturnType<typeof creditNoteAmounts> | null = null;
  let previewError: string | null = null;
  try {
    const request = lines.map((l) => {
      const paise = amountToPaise(amounts[l.id] ?? "");
      if (paise === null)
        throw new Error("Enter amounts in rupees, like 5000 or 5000.50.");
      return { lineId: l.id, taxablePaise: paise };
    });
    preview = creditNoteAmounts({
      supply,
      roundOff,
      creditedRoundOff,
      lines,
      request,
    });
  } catch (error) {
    previewError = error instanceof Error ? error.message : String(error);
  }
  const done = state.tone === "success";

  if (done)
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <FormMessage message={state.message} tone="success" />
        <Link
          href={`/billing/invoices/${invoiceId}`}
          className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
        >
          Back to the invoice
        </Link>
      </div>
    );

  return (
    <form
      action={(form) => {
        setConfirming(false);
        formAction(form);
      }}
      onSubmit={(e) => {
        if (!confirming) {
          e.preventDefault();
          if (preview) setConfirming(true);
        }
      }}
      className="flex max-w-2xl flex-col gap-6"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field
        label="Why"
        htmlFor={`${base}-reason`}
        error={state.fieldErrors?.reason}
      >
        <Select
          id={`${base}-reason`}
          name="reason"
          defaultValue={state.values?.reason ?? ""}
          required
          {...errorProps(`${base}-reason`, state.fieldErrors?.reason)}
        >
          <option value="" disabled>
            Choose a reason
          </option>
          {Object.entries(CREDIT_REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Note (printed on the credit note)"
        htmlFor={`${base}-note`}
        hint="Optional, up to 200 characters, e.g. “Lift out of service 3–9 Nov”."
        error={state.fieldErrors?.note}
      >
        <Textarea
          id={`${base}-note`}
          name="note"
          maxLength={200}
          defaultValue={state.values?.note ?? ""}
          {...errorProps(`${base}-note`, state.fieldErrors?.note, true)}
        />
      </Field>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-medium">
          Amount to take off each line, before GST
        </legend>
        <p className="text-sm text-muted-foreground">
          Each line starts with all that is left on it. Change an amount for a
          part credit, or make it 0 to leave the line as it is.
        </p>
        {lines.map((l) => {
          const id = `${base}-${l.id}`;
          const name = `${LINE_FIELD}${l.id}`;
          const error = state.fieldErrors?.[name];
          return (
            <Field
              key={l.id}
              label={l.description}
              htmlFor={id}
              hint={`Up to ${formatINR(left(l))}${l.credited.taxable > 0 ? ` (${formatINR(l.credited.taxable)} already credited)` : ""}`}
              error={error}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-muted-foreground">
                  ₹
                </span>
                <Input
                  id={id}
                  name={name}
                  inputMode="decimal"
                  className="text-right tabular-nums"
                  value={amounts[l.id] ?? ""}
                  disabled={left(l) === 0}
                  onChange={(e) => {
                    setAmounts({ ...amounts, [l.id]: e.target.value });
                    setConfirming(false);
                  }}
                  {...errorProps(id, error, true)}
                />
              </div>
            </Field>
          );
        })}
        {state.fieldErrors?.lines && (
          <p className="text-sm text-destructive">{state.fieldErrors.lines}</p>
        )}
      </fieldset>

      <section aria-live="polite" className="flex flex-col gap-1 text-sm">
        {preview ? (
          <>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Before GST</span>
              <span className="tabular-nums">
                {formatINR(preview.totals.taxable)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">GST</span>
              <span className="tabular-nums">
                {formatINR(
                  preview.totals.cgst +
                    preview.totals.sgst +
                    preview.totals.igst,
                )}
              </span>
            </p>
            {preview.totals.roundOff !== 0 && (
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">Round off</span>
                <span className="tabular-nums">
                  {formatINR(preview.totals.roundOff)}
                </span>
              </p>
            )}
            <p className="flex justify-between gap-4 border-t pt-2 font-medium">
              <span>Credit note total</span>
              <span className="tabular-nums">
                {formatINR(preview.totals.total)}
              </span>
            </p>
          </>
        ) : (
          <p className="text-destructive">{previewError}</p>
        )}
      </section>

      <FormMessage message={state.message} tone={state.tone} />
      {confirming && preview ? (
        <div
          className="flex flex-col gap-3 rounded-lg border p-4"
          role="group"
          aria-label="Confirm the credit note"
        >
          <p className="text-sm font-medium">
            Issue a credit note for {formatINR(preview.totals.total)}, dated
            today ({dateLabel})?
          </p>
          <p className="text-sm text-muted-foreground">
            It gets its credit note number and{" "}
            {to.length > 0
              ? `is emailed to ${to.join(", ")}`
              : "you can download its PDF from the invoice page (the tenant has no email address)"}
            . It can&apos;t be changed afterwards.
            {preview.fullyCredited
              ? " Nothing will be left to pay on the invoice."
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={confirmButton} type="submit" className="h-11 md:h-9">
              Issue credit note
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => setConfirming(false)}
            >
              Go back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              type="submit"
              disabled={pending || !preview}
              className="h-11 md:h-9"
            >
              {pending ? "Issuing…" : "Issue credit note"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            GST on this invoice can be reduced by a credit note until{" "}
            {deadlineLabel}.
          </p>
        </div>
      )}
    </form>
  );
}
