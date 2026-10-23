"use client";

import { useRouter } from "next/navigation";
import { Fragment, useId, useMemo, useState, useTransition } from "react";
import type { FormField } from "@/components/forms/SimpleForm";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  errorProps,
  Field,
  FormMessage,
} from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { formatArea, formatDate, formatINR, formatMonth } from "@/lib/format";
import {
  LEASE_FORM_STEPS,
  parseLeaseForm,
  type LeaseFormErrors,
  type LeaseFormInput,
  type LeaseFormStep,
} from "@/lib/leases/draft";
import { BLANK_CHARGE, BLANK_RULE } from "@/lib/leases/prefill";
import {
  previewLease,
  saveLease,
  type LeaseFormResult,
} from "@/server/actions/leases";

type Row = Record<string, string | boolean>;

export interface LeaseFormOptions {
  tenants: { id: string; name: string }[];
  buildings: { id: string; name: string }[];
  units: {
    id: string;
    buildingId: string;
    code: string;
    carpetArea: number;
    chargeableArea: number;
  }[];
}

const STEP_TITLES: Record<LeaseFormStep, string> = {
  parties: "Tenant and units",
  dates: "Dates",
  charges: "Rent and charges",
  review: "Check and save",
};

const CHARGE_TYPES = {
  rent: "Rent",
  cam: "Maintenance (CAM)",
  parking: "Parking",
  utilities: "Utilities",
  signage: "Signage",
  other: "Other",
};

const BASES = {
  per_sqft: "Per sq ft a month",
  fixed: "Fixed amount",
  per_slot: "Per parking slot a month",
};

const DATE_LABELS = {
  expiry: "Lease ends",
  lock_in_end: "Lock-in ends",
  notice_deadline: "Last day to give notice",
  escalation: "Rent increase",
};

/** Errors for one step only, so Next doesn't complain about later steps. */
function errorsFor(step: LeaseFormStep, errors: LeaseFormErrors) {
  const keys: Record<LeaseFormStep, RegExp> = {
    parties: /^(tenantId|buildingId|unitIds|areaBasis)$/,
    dates:
      /^(startDate|endDate|lockInEndDate|noticePeriodMonths|rentFree|rentFreeLength|deposit)$/,
    charges: /^(charges|rules|settings)/,
    review: /.^/,
  };
  return Object.fromEntries(
    Object.entries(errors).filter(([k]) => keys[step].test(k)),
  );
}

/**
 * Add a lease in four steps: tenant and units, dates and rent-free period,
 * charges and rent increases, then the full rent schedule to check before
 * saving. A renewal (`replacesLeaseId`) keeps the tenant fixed.
 */
export function LeaseForm({
  initial,
  options,
  settingFields,
  replacesLeaseId = null,
}: {
  initial: LeaseFormInput;
  options: LeaseFormOptions;
  /** Lease-level settings for "More options" (billingRuleFields). */
  settingFields: FormField[];
  replacesLeaseId?: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [step, setStep] = useState<LeaseFormStep>("parties");
  const [errors, setErrors] = useState<LeaseFormErrors>({});
  const [message, setMessage] = useState<string>();
  const [review, setReview] =
    useState<Extract<LeaseFormResult, { ok: true }>>();
  const [pending, startTransition] = useTransition();
  const index = LEASE_FORM_STEPS.indexOf(step);

  const set = (patch: Partial<LeaseFormInput>) =>
    setValues((v) => ({ ...v, ...patch }));
  const setRow = (list: "charges" | "rules", i: number, patch: Row) =>
    setValues((v) => ({
      ...v,
      [list]: v[list].map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));

  const buildingUnits = useMemo(
    () => options.units.filter((u) => u.buildingId === values.buildingId),
    [options.units, values.buildingId],
  );

  function show(result: Extract<LeaseFormResult, { ok: false }>) {
    setErrors(result.errors);
    setMessage(result.message);
    setStep(result.step);
  }

  function next() {
    setMessage(undefined);
    const parsed = parseLeaseForm(values);
    const stepErrors = parsed.ok ? {} : errorsFor(step, parsed.errors);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    if (step !== "charges") {
      setStep(LEASE_FORM_STEPS[index + 1]!);
      return;
    }
    startTransition(async () => {
      let result: LeaseFormResult;
      try {
        result = await previewLease(values, replacesLeaseId);
      } catch {
        setMessage(
          "We couldn't work out the rent just now. Check your connection and try again.",
        );
        return;
      }
      if (!result.ok) return show(result);
      setReview(result);
      setStep("review");
    });
  }

  function save() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveLease>>;
      try {
        result = await saveLease(values, replacesLeaseId);
      } catch {
        setMessage(
          "We couldn't save the lease. Check your connection and try again. Nothing was saved.",
        );
        return;
      }
      if (result.ok === "saved") router.push(`/leases/${result.id}`);
      else show(result);
    });
  }

  const field = (
    name: string,
    label: string,
    input: (common: {
      id: string;
      "aria-invalid"?: boolean;
    }) => React.ReactNode,
    hint?: string,
  ) => {
    const fid = `${id}-${name}`;
    return (
      <Field label={label} htmlFor={fid} hint={hint} error={errors[name]}>
        {input({ id: fid, ...errorProps(fid, errors[name], Boolean(hint)) })}
      </Field>
    );
  };

  const text = (
    name: keyof LeaseFormInput,
    label: string,
    hint?: string,
    type = "text",
    inputMode?: "numeric" | "decimal",
  ) =>
    field(
      name,
      label,
      (common) => (
        <Input
          {...common}
          type={type}
          inputMode={inputMode}
          value={String(values[name] ?? "")}
          onChange={(e) => set({ [name]: e.target.value })}
        />
      ),
      hint,
    );

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        // On the review step only the Save lease button saves.
        if (step !== "review") next();
      }}
    >
      <nav aria-label="Steps">
        <p className="text-sm text-muted-foreground">
          Step {index + 1} of {LEASE_FORM_STEPS.length}
        </p>
        <h2 className="text-lg font-medium">{STEP_TITLES[step]}</h2>
        <ol className="mt-2 flex gap-1" aria-hidden>
          {LEASE_FORM_STEPS.map((s, i) => (
            <li
              key={s}
              className={`h-1 flex-1 rounded ${i <= index ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </ol>
      </nav>

      {message && <FormMessage message={message} />}

      {step === "parties" && (
        <div className="flex flex-col gap-4">
          {field("tenantId", "Tenant", (common) => (
            <Select
              {...common}
              value={values.tenantId}
              disabled={Boolean(replacesLeaseId)}
              onChange={(e) => set({ tenantId: e.target.value })}
            >
              <option value="">Choose a tenant</option>
              {options.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          ))}
          {field("buildingId", "Building", (common) => (
            <Select
              {...common}
              value={values.buildingId}
              onChange={(e) => set({ buildingId: e.target.value, unitIds: [] })}
            >
              <option value="">Choose a building</option>
              {options.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          ))}
          {values.buildingId && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Units</legend>
              {buildingUnits.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This building has no units yet. Add them under Leases →
                  Buildings and units.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {buildingUnits.map((u) => (
                  <label
                    key={u.id}
                    className="flex min-h-11 items-center gap-2 rounded-md border px-3"
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={values.unitIds.includes(u.id)}
                      onChange={(e) =>
                        set({
                          unitIds: e.target.checked
                            ? [...values.unitIds, u.id]
                            : values.unitIds.filter((x) => x !== u.id),
                        })
                      }
                    />
                    <span className="text-sm">
                      {u.code}
                      <span className="block text-muted-foreground">
                        {formatArea(
                          values.areaBasis === "carpet"
                            ? u.carpetArea
                            : u.chargeableArea,
                        )}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.unitIds && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.unitIds}
                </p>
              )}
            </fieldset>
          )}
          {field("areaBasis", "Rent per sq ft is charged on", (common) => (
            <Select
              {...common}
              value={values.areaBasis}
              onChange={(e) => set({ areaBasis: e.target.value })}
            >
              <option value="chargeable">Billed area</option>
              <option value="carpet">Carpet area</option>
            </Select>
          ))}
        </div>
      )}

      {step === "dates" && (
        <div className="flex flex-col gap-4">
          {text("startDate", "Lease starts on", undefined, "date")}
          {text("endDate", "Last day of the lease", undefined, "date")}
          {field("rentFree", "Rent-free period", (common) => (
            <Select
              {...common}
              value={values.rentFree}
              onChange={(e) => set({ rentFree: e.target.value })}
            >
              <option value="none">None</option>
              <option value="months">Some months</option>
              <option value="days">Some days</option>
            </Select>
          ))}
          {values.rentFree !== "none" &&
            text(
              "rentFreeLength",
              `How many rent-free ${values.rentFree}`,
              "Rent starts after this. Maintenance (CAM) and other charges are billed from the lease start.",
              "text",
              "numeric",
            )}
          {text(
            "lockInEndDate",
            "Lock-in: tenant can't leave before (optional)",
            "The last day of the lock-in.",
            "date",
          )}
          {text(
            "noticePeriodMonths",
            "Notice period in months (optional)",
            undefined,
            "text",
            "numeric",
          )}
          {text(
            "deposit",
            "Security deposit in ₹ (optional)",
            "For example 6,00,000.",
            "text",
            "decimal",
          )}
        </div>
      )}

      {step === "charges" && (
        <div className="flex flex-col gap-6">
          {errors.charges && <FormMessage message={errors.charges} />}
          {values.charges.map((c, i) => {
            const k = (f: string) => `charges.${i}.${f}`;
            const rowField = (
              f: string,
              label: string,
              type = "text",
              hint?: string,
            ) =>
              field(
                k(f),
                label,
                (common) => (
                  <Input
                    {...common}
                    type={type}
                    inputMode={
                      f === "amount" || f === "gstRate"
                        ? "decimal"
                        : f === "slots" || f === "sacCode"
                          ? "numeric"
                          : undefined
                    }
                    value={String(c[f] ?? "")}
                    onChange={(e) =>
                      setRow("charges", i, { [f]: e.target.value })
                    }
                  />
                ),
                hint,
              );
            return (
              <Card key={i} className="flex flex-col gap-4 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">
                    {CHARGE_TYPES[c.type as keyof typeof CHARGE_TYPES]}
                  </h3>
                  {values.charges.length > 1 && (
                    <Button
                      type="button"
                      className="h-11 md:h-9"
                      variant="ghost"
                      onClick={() =>
                        set({
                          charges: values.charges.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove this charge
                    </Button>
                  )}
                </div>
                {field(k("type"), "Charge", (common) => (
                  <Select
                    {...common}
                    value={String(c.type)}
                    onChange={(e) =>
                      setRow("charges", i, { type: e.target.value })
                    }
                  >
                    {Object.entries(CHARGE_TYPES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                ))}
                {field(k("basis"), "Charged as", (common) => (
                  <Select
                    {...common}
                    value={String(c.basis)}
                    onChange={(e) =>
                      setRow("charges", i, { basis: e.target.value })
                    }
                  >
                    {Object.entries(BASES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                ))}
                {rowField(
                  "amount",
                  c.basis === "fixed"
                    ? "Amount in ₹ each month (or quarter)"
                    : c.basis === "per_slot"
                      ? "₹ per slot a month"
                      : "₹ per sq ft a month",
                )}
                {c.basis === "per_slot" && rowField("slots", "Number of slots")}
                {field(k("frequency"), "Billed", (common) => (
                  <Select
                    {...common}
                    value={String(c.frequency)}
                    onChange={(e) =>
                      setRow("charges", i, { frequency: e.target.value })
                    }
                  >
                    <option value="monthly">Every month</option>
                    <option value="quarterly">Every quarter</option>
                  </Select>
                ))}
                <details className="flex flex-col gap-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                    More options
                  </summary>
                  <div className="flex flex-col gap-4 pt-2">
                    {field(k("timing"), "When it's billed", (common) => (
                      <Select
                        {...common}
                        value={String(c.timing)}
                        onChange={(e) =>
                          setRow("charges", i, { timing: e.target.value })
                        }
                      >
                        <option value="">Same as the building</option>
                        <option value="advance">In advance</option>
                        <option value="arrears">After the month ends</option>
                      </Select>
                    ))}
                    {rowField(
                      "gstRate",
                      "GST rate in % (blank: same as the building)",
                    )}
                    {rowField(
                      "sacCode",
                      "SAC code (optional)",
                      "text",
                      "The service code printed on the invoice. Leave blank to use the building's.",
                    )}
                    {rowField(
                      "startDate",
                      "Starts on (blank: lease start)",
                      "date",
                    )}
                    {rowField("endDate", "Ends on (blank: lease end)", "date")}
                    {rowField("label", "Name on the invoice (optional)")}
                  </div>
                </details>
              </Card>
            );
          })}
          <Button
            type="button"
            className="h-11 md:h-9"
            variant="outline"
            onClick={() =>
              set({
                charges: [...values.charges, { ...BLANK_CHARGE, type: "cam" }],
              })
            }
          >
            Add another charge
          </Button>

          <section className="flex flex-col gap-4">
            <h3 className="font-medium">Rent increases</h3>
            {errors.rules && <FormMessage message={errors.rules} />}
            {values.rules.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No rent increases. Rent stays the same for the whole lease.
              </p>
            )}
            {values.rules.map((r, i) => {
              const k = (f: string) => `rules.${i}.${f}`;
              return (
                <Card key={i} className="flex flex-col gap-4 p-4">
                  <p className="text-sm">
                    Rent goes up {String(r.percent || "…")}% every{" "}
                    {String(r.everyMonths) === "1"
                      ? "month"
                      : `${r.everyMonths || "…"} months`}
                  </p>
                  {field(k("percent"), "Increase in %", (common) => (
                    <Input
                      {...common}
                      inputMode="decimal"
                      value={String(r.percent)}
                      onChange={(e) =>
                        setRow("rules", i, { percent: e.target.value })
                      }
                    />
                  ))}
                  {field(
                    k("everyMonths"),
                    "Every how many months",
                    (common) => (
                      <Input
                        {...common}
                        inputMode="numeric"
                        value={String(r.everyMonths)}
                        onChange={(e) =>
                          setRow("rules", i, { everyMonths: e.target.value })
                        }
                      />
                    ),
                  )}
                  {field(k("anchor"), "Counted from", (common) => (
                    <Select
                      {...common}
                      value={String(r.anchor)}
                      onChange={(e) =>
                        setRow("rules", i, { anchor: e.target.value })
                      }
                    >
                      <option value="lease_start">Lease start</option>
                      <option value="rent_commencement">
                        The day rent starts
                      </option>
                      <option value="custom">Another date</option>
                    </Select>
                  ))}
                  {r.anchor === "custom" &&
                    field(
                      k("anchorDate"),
                      "Increases counted from",
                      (common) => (
                        <Input
                          {...common}
                          type="date"
                          value={String(r.anchorDate)}
                          onChange={(e) =>
                            setRow("rules", i, { anchorDate: e.target.value })
                          }
                        />
                      ),
                    )}
                  {field(k("compounding"), "Each increase is on", (common) => (
                    <Select
                      {...common}
                      value={String(r.compounding)}
                      onChange={(e) =>
                        setRow("rules", i, {
                          compounding: e.target.value === "true",
                        })
                      }
                    >
                      <option value="true">
                        The rent after the last increase
                      </option>
                      <option value="false">The starting rent</option>
                    </Select>
                  ))}
                  <Button
                    type="button"
                    className="h-11 md:h-9"
                    variant="ghost"
                    onClick={() =>
                      set({ rules: values.rules.filter((_, j) => j !== i) })
                    }
                  >
                    Remove this increase
                  </Button>
                </Card>
              );
            })}
            <Button
              type="button"
              className="h-11 md:h-9"
              variant="outline"
              onClick={() =>
                set({ rules: [...values.rules, { ...BLANK_RULE }] })
              }
            >
              Add a rent increase
            </Button>
          </section>

          {settingFields.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                More options for this lease
              </summary>
              <div className="flex flex-col gap-4 pt-2">
                {settingFields.map((f) => (
                  <Fragment key={f.name}>
                    {field(
                      `settings.${f.name}`,
                      f.label,
                      (common) => {
                        const props = {
                          ...common,
                          value: values.settings[f.name] ?? "",
                          onChange: (
                            e: React.ChangeEvent<
                              HTMLInputElement | HTMLSelectElement
                            >,
                          ) =>
                            set({
                              settings: {
                                ...values.settings,
                                [f.name]: e.target.value,
                              },
                            }),
                        };
                        return f.options ? (
                          <Select {...props}>
                            {f.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input {...props} inputMode={f.inputMode} />
                        );
                      },
                      f.hint,
                    )}
                  </Fragment>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {step === "review" && review && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Rent starts on {formatDate(review.rentCommencementDate)}. Area{" "}
            {formatArea(review.areaHundredths)}. Amounts are before GST, in the
            month they&apos;re billed.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {review.criticalDates.map((d) => (
              <li key={`${d.type}-${d.date}`}>
                {DATE_LABELS[d.type] ?? "Key date"}: {formatDate(d.date)}
              </li>
            ))}
          </ul>
          <ScheduleTable rows={review.rows} />
        </div>
      )}

      <div className="flex gap-2">
        {index > 0 && (
          <Button
            type="button"
            className="h-11 md:h-9"
            variant="outline"
            onClick={() => {
              setErrors({});
              setMessage(undefined);
              setStep(LEASE_FORM_STEPS[index - 1]!);
            }}
          >
            Back
          </Button>
        )}
        <Button
          type={step === "review" ? "button" : "submit"}
          onClick={step === "review" ? save : undefined}
          disabled={pending}
          className="h-11 md:h-9"
        >
          {step === "review"
            ? pending
              ? "Saving…"
              : "Save lease"
            : pending
              ? "Working out the rent…"
              : "Next"}
        </Button>
      </div>
    </form>
  );
}

/** The full schedule: a table from 768px, cards on phones. */
export function ScheduleTable({
  rows,
}: {
  rows: {
    month: string;
    rent: number;
    other: number;
    total: number;
    rentIncreased: boolean;
  }[];
}) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 font-normal">Month</th>
            <th className="py-2 text-right font-normal">Rent</th>
            <th className="py-2 text-right font-normal">Other charges</th>
            <th className="py-2 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t">
              <td className="py-2">
                {formatMonth(r.month)}{" "}
                {r.rentIncreased && <Badge>Rent increase</Badge>}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatINR(r.rent)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatINR(r.other)}
              </td>
              <td className="py-2 text-right font-medium tabular-nums">
                {formatINR(r.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.month} className="rounded-md border p-3 text-sm">
            <div className="flex justify-between font-medium">
              <span>{formatMonth(r.month)}</span>
              <span className="tabular-nums">{formatINR(r.total)}</span>
            </div>
            <div className="text-muted-foreground">
              Rent {formatINR(r.rent)} · Other {formatINR(r.other)}
            </div>
            {r.rentIncreased && <Badge>Rent increase</Badge>}
          </li>
        ))}
      </ul>
    </>
  );
}
