// The rent roll: every lease running on a date, with its units, billed area,
// rent, rate per sq ft, lease dates and next rent increase. Pure: leases in,
// a report out. Amounts come from the billing engine's own rent steps
// (amountSteps), so the rent here is the rent the invoices bill.

import { compareDates, type PlainDate } from "@/lib/billing/dates";
import { amountSteps } from "@/lib/billing/escalation";
import { mulDiv, sumPaise, type Paise } from "@/lib/billing/money";
import type { LeaseInput } from "@/lib/billing/schedule";
import type { AmountStep, BillingSettings, Charge } from "@/lib/billing/types";
import { LEASE_STATUS, type LeaseStatus } from "@/components/leases/status";
import { asOnLabel, type Report, type ReportRow } from "./report";

export type RentRollLease = {
  leaseId: string;
  status: LeaseStatus;
  tenantName: string;
  buildingName: string;
  unitCodes: string[];
  /** Billed area of the lease's units, hundredths of a sq ft. */
  area: number;
  startDate: PlainDate;
  endDate: PlainDate;
  rentStartsOn: PlainDate;
  lockInEndDate: PlainDate | null;
  noticePeriodMonths: number | null;
  depositPaise: Paise;
  input: LeaseInput;
  settings: Pick<
    BillingSettings,
    "roundIncreasedRent" | "monthEndRule" | "afterCustomIncrease"
  >;
};

/** A lease covers `date` if it is saved (not draft) and the date is inside it. */
export function leaseCovers(
  lease: { status: string; startDate: PlainDate; endDate: PlainDate },
  date: PlainDate,
): boolean {
  return (
    lease.status !== "draft" &&
    compareDates(lease.startDate, date) <= 0 &&
    compareDates(date, lease.endDate) <= 0
  );
}

const runsOn = (c: Charge, date: PlainDate) =>
  compareDates(c.startDate, date) <= 0 &&
  (!c.endDate || compareDates(date, c.endDate) <= 0);

/** The step in force on `date`: the last one starting on or before it. */
function stepOn(steps: AmountStep[], date: PlainDate): AmountStep | undefined {
  let found: AmountStep | undefined;
  for (const s of steps) if (compareDates(s.from, date) <= 0) found = s;
  return found;
}

/**
 * A charge's amount per month: a quarterly charge's quarter ÷ 3, rounded
 * half up to the paisa (a report figure; invoices bill the quarter).
 */
function perMonth(c: Charge, amount: Paise): Paise {
  return c.frequency === "quarterly" ? mulDiv(amount, 1, 3) : amount;
}

type Priced = { charge: Charge; steps: AmountStep[] };

function monthlyOn(priced: Priced[], date: PlainDate): Paise {
  return sumPaise(
    priced
      .filter((p) => runsOn(p.charge, date))
      .map((p) => perMonth(p.charge, stepOn(p.steps, date)?.amount ?? 0)),
  );
}

export type RentFigures = {
  /** Rent per month on the date, before GST. */
  rent: Paise;
  /** Paise per sq ft per month; null with no area. */
  ratePerSqft: Paise | null;
  /** Every other charge per month (maintenance, parking...), before GST. */
  otherCharges: Paise;
  nextIncrease: { date: PlainDate; rent: Paise } | null;
};

/** The rent figures of one lease on `asOf`. */
export function rentFigures(
  lease: RentRollLease,
  asOf: PlainDate,
): RentFigures {
  const priced: Priced[] = lease.input.charges.map((charge) => ({
    charge,
    steps: amountSteps({
      charge,
      lease: lease.input,
      rules: lease.input.escalationRules,
      custom: lease.input.customEscalations,
      settings: lease.settings,
    }),
  }));
  const rentCharges = priced.filter((p) => p.charge.type === "rent");
  const rent = monthlyOn(rentCharges, asOf);

  // Every rent charge's first base step is its start, not an increase.
  let next: PlainDate | null = null;
  for (const p of rentCharges) {
    for (const s of p.steps.slice(1)) {
      if (
        compareDates(s.from, asOf) > 0 &&
        compareDates(s.from, lease.endDate) <= 0 &&
        (next === null || compareDates(s.from, next) < 0)
      )
        next = s.from;
    }
  }

  // One per sq ft rent not yet increased prints its own rate; anything
  // else is rent ÷ area, rounded half up to the paisa.
  const runningRent = rentCharges.filter((p) => runsOn(p.charge, asOf));
  const only = runningRent.length === 1 ? runningRent[0] : undefined;
  const ratePerSqft =
    lease.area <= 0
      ? null
      : only?.charge.basis === "per_sqft" &&
          only.charge.frequency !== "quarterly" &&
          stepOn(only.steps, asOf) === only.steps[0]
        ? only.charge.ratePaise
        : mulDiv(rent, 100, lease.area);

  return {
    rent,
    ratePerSqft,
    otherCharges: monthlyOn(
      priced.filter((p) => p.charge.type !== "rent"),
      asOf,
    ),
    nextIncrease: next
      ? { date: next, rent: monthlyOn(rentCharges, next) }
      : null,
  };
}

const byPlace = (a: RentRollLease, b: RentRollLease) =>
  a.buildingName.localeCompare(b.buildingName) ||
  (a.unitCodes[0] ?? "").localeCompare(b.unitCodes[0] ?? "", "en", {
    numeric: true,
  }) ||
  a.tenantName.localeCompare(b.tenantName);

export function rentRoll(
  leases: readonly RentRollLease[],
  asOf: PlainDate,
): Report {
  const running = leases.filter((l) => leaseCovers(l, asOf)).sort(byPlace);
  const rows: ReportRow[] = running.map((l) => {
    const f = rentFigures(l, asOf);
    return {
      building: l.buildingName,
      units: l.unitCodes.join(", "),
      tenant: l.tenantName,
      status: LEASE_STATUS[l.status].label,
      area: l.area,
      rent: f.rent,
      rate: f.ratePerSqft,
      other: f.otherCharges,
      start: l.startDate,
      rentStarts: l.rentStartsOn,
      lockIn: l.lockInEndDate,
      end: l.endDate,
      nextIncrease: f.nextIncrease?.date ?? null,
      rentAfter: f.nextIncrease?.rent ?? null,
      deposit: l.depositPaise,
    };
  });
  const total = (key: string) => sumPaise(rows.map((r) => Number(r[key] ?? 0)));
  return {
    slug: "rent-roll",
    title: "Rent roll",
    period: asOnLabel(asOf),
    sections: [
      {
        title: "Leases",
        empty:
          "No lease is running on this date. Choose another date, or add a lease in Leases.",
        columns: [
          { key: "tenant", label: "Tenant", kind: "text" },
          { key: "building", label: "Building", kind: "text" },
          { key: "units", label: "Units", kind: "text" },
          { key: "status", label: "Status", kind: "text" },
          {
            key: "area",
            label: "Billed area",
            kind: "area",
            hint: "The area rent is billed on",
          },
          { key: "rent", label: "Rent per month", kind: "money" },
          {
            key: "rate",
            label: "Rent per sq ft",
            kind: "money",
            hint: "Rent per month ÷ billed area",
          },
          { key: "other", label: "Other charges per month", kind: "money" },
          { key: "start", label: "Lease starts", kind: "date" },
          { key: "rentStarts", label: "Rent starts on", kind: "date" },
          { key: "lockIn", label: "Lock-in ends", kind: "date" },
          { key: "end", label: "Lease ends", kind: "date" },
          { key: "nextIncrease", label: "Next rent increase", kind: "date" },
          {
            key: "rentAfter",
            label: "Rent after increase",
            kind: "money",
            hint: "Rent per month from the next increase date",
          },
          { key: "deposit", label: "Deposit", kind: "money" },
        ],
        rows,
        totals:
          rows.length > 0
            ? {
                tenant: "Total",
                area: total("area"),
                rent: total("rent"),
                other: total("other"),
                deposit: total("deposit"),
              }
            : undefined,
      },
    ],
    notes: [
      "Amounts are before GST. A quarterly charge shows a third of its quarter per month.",
      "Rent shown is the full rent, even if the tenant is in a rent-free period.",
    ],
  };
}
