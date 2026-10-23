// Excel import of tenants and leases (docs/PRODUCT_PLAN.md, "Excel import"):
// a "Tenants" sheet (one tenant and its main contact per row) and a
// "Leases" sheet (one lease per row: units, dates, rent, a yearly increase,
// maintenance and parking). Each row becomes exactly what the tenant form
// and the lease form send, so the same checks and the same saving apply.
// Pure: rows in, form inputs or row errors out.

import { parseBankDate } from "@/lib/bank/statement";
import { chargeBaseAmount } from "@/lib/billing/charges";
import { compareDates, type PlainDate } from "@/lib/billing/dates";
import { amountSteps } from "@/lib/billing/escalation";
import { mulDiv } from "@/lib/billing/money";
import type { LeaseInput } from "@/lib/billing/schedule";
import type { BillingSettings } from "@/lib/billing/types";
import { formatINR } from "@/lib/format";
import type { LeaseFormErrors, LeaseFormInput } from "@/lib/leases/draft";
import { rupeesToPaise } from "@/lib/settings/rules-form";
import { contactSchema, tenantSchema } from "@/lib/tenants/forms";
import { stateCodeOf } from "./property";
import type { ColumnSpec } from "./sheets";

export const TENANT_COLUMNS = [
  { key: "name", heading: "Tenant name", required: true },
  { key: "gstin", heading: "GSTIN" },
  { key: "pan", heading: "PAN" },
  { key: "address", heading: "Billing address", required: true },
  { key: "state", heading: "State" },
  { key: "contactName", heading: "Contact name", required: true },
  { key: "email", heading: "Contact email" },
  { key: "phone", heading: "Contact phone" },
  { key: "whatsapp", heading: "WhatsApp" },
  { key: "deductsTds", heading: "Deducts TDS" },
  { key: "tdsRate", heading: "TDS rate (%)" },
] as const satisfies readonly ColumnSpec[];

export const LEASE_COLUMNS = [
  { key: "tenant", heading: "Tenant name", required: true },
  { key: "building", heading: "Building name", required: true },
  { key: "units", heading: "Units", required: true },
  { key: "start", heading: "Lease starts", required: true },
  { key: "end", heading: "Last day", required: true },
  { key: "lockIn", heading: "Lock-in ends" },
  { key: "notice", heading: "Notice (months)" },
  { key: "rentFreeMonths", heading: "Rent-free months" },
  { key: "rentFreeDays", heading: "Rent-free days" },
  { key: "deposit", heading: "Deposit (₹)" },
  { key: "area", heading: "Area" },
  { key: "rent", heading: "Rent at lease start (₹)", required: true },
  { key: "rentToday", heading: "Rent today (₹)" },
  { key: "rentBasis", heading: "Rent is" },
  { key: "rentFrequency", heading: "Rent billed" },
  { key: "increase", heading: "Rent increase (%)" },
  { key: "increaseEvery", heading: "Increase every (months)" },
  { key: "increaseFrom", heading: "Increase counted from" },
  { key: "camPerSqft", heading: "Maintenance (₹ per sq ft)" },
  { key: "camPerMonth", heading: "Maintenance (₹ per month)" },
  { key: "parkingSlots", heading: "Parking slots" },
  { key: "parkingRate", heading: "Parking (₹ per slot)" },
] as const satisfies readonly ColumnSpec[];

type TenantValues = Record<(typeof TENANT_COLUMNS)[number]["key"], string>;
type LeaseValues = Record<(typeof LEASE_COLUMNS)[number]["key"], string>;

const word = (s: string) => s.trim().toLowerCase();
const yes = (s: string) => ["yes", "y", "true", "1"].includes(word(s));
const no = (s: string) => ["no", "n", "false", "0"].includes(word(s));

/** A yes/no cell; blank gives `blank`, anything else null. */
function yesNo(s: string, blank: boolean): boolean | null {
  if (s.trim() === "") return blank;
  return yes(s) ? true : no(s) ? false : null;
}

const firstIssue = (e: { issues: { message: string }[] }) =>
  e.issues[0]?.message ?? "Check this row.";

/** One Tenants row as the tenant form's data and its main contact, or what's wrong. */
export function readTenantRow(v: TenantValues):
  | {
      tenant: ReturnType<typeof tenantSchema.parse>;
      contact: ReturnType<typeof contactSchema.parse>;
    }
  | { error: string } {
  const gstin = v.gstin.trim().toUpperCase();
  const stateCode = v.state
    ? stateCodeOf(v.state)
    : /^\d{2}/.test(gstin)
      ? gstin.slice(0, 2)
      : null;
  if (!stateCode)
    return {
      error: v.state
        ? `"${v.state}" isn't an Indian state. Type its name, like Maharashtra, or its GST code, like 27.`
        : "Type the state of the billing address (or the GSTIN, which includes it).",
    };
  const deducts = yesNo(v.deductsTds, true);
  if (deducts === null) return { error: 'Type Yes or No under "Deducts TDS".' };
  const whatsapp = yesNo(v.whatsapp, false);
  if (whatsapp === null) return { error: 'Type Yes or No under "WhatsApp".' };
  const tenant = tenantSchema.safeParse({
    companyName: v.name,
    gstin: v.gstin,
    pan: v.pan,
    billingAddress: v.address,
    stateCode,
    deductsTdsRent: deducts ? "yes" : "no",
    tdsRateRent: v.tdsRate.replace("%", ""),
    deductsTdsCam: "same",
    tdsRateCam: "",
    deductsTdsParking: "same",
    tdsRateParking: "",
    deductsTdsOther: "same",
    tdsRateOther: "",
    notes: "",
  });
  if (!tenant.success) return { error: firstIssue(tenant.error) };
  const contact = contactSchema.safeParse({
    name: v.contactName,
    role: "billing",
    email: v.email,
    phone: v.phone,
    whatsapp: whatsapp ? "yes" : "no",
  });
  if (!contact.success) return { error: firstIssue(contact.error) };
  return { tenant: tenant.data, contact: contact.data };
}

/** Excel dates arrive as DD-MM-YYYY; the forms take YYYY-MM-DD. */
const isoDate = (s: string) => (s.trim() ? (parseBankDate(s) ?? s.trim()) : "");

/**
 * Rupees per month as rupees per quarter, exactly (× 3 in paise):
 * "1,00,000" → "300000.00". Text that isn't an amount is passed on for the
 * lease form to refuse in its own words.
 */
export function threeMonths(rupees: string): string {
  const paise = rupeesToPaise(rupees.trim().replace(/,/g, ""));
  if (paise === null) return rupees;
  const quarter = paise * 3;
  return `${Math.trunc(quarter / 100)}.${String(quarter % 100).padStart(2, "0")}`;
}

/** The highest rent per sq ft a month taken as a rate: ₹2,000. */
const MAX_RATE_PAISE = 200_000;

/** Which charge each lease form charge row came from, for messages. */
export type ChargeSource = "Rent" | "Maintenance" | "Parking";

export type LeaseLookup = {
  tenantId: (name: string) => string | null;
  building: (
    name: string,
  ) => { id: string; unitId: (code: string) => string | null } | null;
};

/**
 * One Leases row as the lease form's input, or what's wrong with the
 * names in it. The form's own checks (dates, amounts, units free) run after.
 */
export function leaseRowInput(
  v: LeaseValues,
  lookup: LeaseLookup,
): { input: LeaseFormInput; sources: ChargeSource[] } | { error: string } {
  const tenantId = lookup.tenantId(v.tenant);
  if (!tenantId)
    return {
      error: `There's no tenant called ${v.tenant}. Add it to the Tenants sheet, or check the spelling.`,
    };
  const building = lookup.building(v.building);
  if (!building)
    return {
      error: `There's no building called ${v.building}. Import buildings and units first, or check the spelling.`,
    };
  const codes = v.units
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean);
  const unknown = codes.filter((c) => !building.unitId(c));
  if (codes.length === 0) return { error: "Type the units, like 301, 302." };
  if (unknown.length > 0)
    return {
      error: `${v.building} has no unit ${unknown.join(", ")}. Check the unit numbers.`,
    };
  const area = word(v.area);
  if (area && !["billed", "carpet", "chargeable"].includes(area))
    return { error: 'Type Billed or Carpet under "Area", or leave it blank.' };
  const basis = word(v.rentBasis);
  if (basis && !["per sq ft", "per sqft", "per month", "fixed"].includes(basis))
    return {
      error:
        'Type "per sq ft" or "per month" under "Rent is", or leave it blank for per sq ft.',
    };
  const frequency = word(v.rentFrequency);
  if (frequency && !["monthly", "quarterly"].includes(frequency))
    return {
      error:
        'Type Monthly or Quarterly under "Rent billed", or leave it blank.',
    };
  const from = word(v.increaseFrom);
  if (from && !["lease start", "rent start"].includes(from))
    return {
      error:
        'Type "Lease start" or "Rent start" under "Increase counted from", or leave it blank for lease start.',
    };
  const months = v.rentFreeMonths.trim();
  const days = v.rentFreeDays.trim();
  if (months && days && months !== "0" && days !== "0")
    return {
      error: "Give the rent-free period in months or in days, not both.",
    };

  const charges: Record<string, string>[] = [];
  const sources: ChargeSource[] = [];
  const fixed = basis === "per month" || basis === "fixed";
  // A blank "Rent is" means per sq ft; a whole rent typed there would bill
  // area × that amount. No Indian office rate comes near ₹2,000 a sq ft.
  const ratePaise = fixed
    ? null
    : rupeesToPaise(v.rent.trim().replace(/,/g, ""));
  if (ratePaise !== null && ratePaise > MAX_RATE_PAISE)
    return {
      error: `Rent at lease start (₹): ${formatINR(ratePaise)} per sq ft a month is more than ${formatINR(MAX_RATE_PAISE)}. If it is the whole rent, type "per month" under "Rent is".`,
    };
  const quarterly = frequency === "quarterly";
  charges.push({
    type: "rent",
    basis: fixed ? "fixed" : "per_sqft",
    // A fixed charge is per billing period (BILLING_RULES section 3): rent
    // per month billed quarterly is three months' rent per quarter.
    amount: fixed && quarterly ? threeMonths(v.rent) : v.rent,
    frequency: frequency || "monthly",
  });
  sources.push("Rent");
  if (v.camPerSqft && v.camPerMonth)
    return {
      error: "Give maintenance per sq ft or per month, not both.",
    };
  if (v.camPerSqft || v.camPerMonth) {
    charges.push({
      type: "cam",
      basis: v.camPerSqft ? "per_sqft" : "fixed",
      amount: v.camPerSqft || v.camPerMonth,
      frequency: "monthly",
    });
    sources.push("Maintenance");
  }
  if (v.parkingSlots || v.parkingRate) {
    charges.push({
      type: "parking",
      basis: "per_slot",
      amount: v.parkingRate,
      slots: v.parkingSlots,
      frequency: "monthly",
    });
    sources.push("Parking");
  }
  return {
    sources,
    input: {
      tenantId,
      buildingId: building.id,
      unitIds: codes.map((c) => building.unitId(c)!),
      areaBasis: area === "carpet" ? "carpet" : "chargeable",
      startDate: isoDate(v.start),
      endDate: isoDate(v.end),
      lockInEndDate: isoDate(v.lockIn),
      noticePeriodMonths: v.notice,
      rentFree:
        months && months !== "0"
          ? "months"
          : days && days !== "0"
            ? "days"
            : "none",
      rentFreeLength:
        months && months !== "0" ? months : days && days !== "0" ? days : "",
      deposit: v.deposit,
      charges,
      rules:
        v.increase || v.increaseEvery
          ? [
              {
                percent: v.increase.replace("%", ""),
                everyMonths: v.increaseEvery || "12",
                anchor:
                  from === "rent start" ? "rent_commencement" : "lease_start",
                anchorDate: "",
                compounding: true,
              },
            ]
          : [],
      settings: {},
    },
  };
}

/**
 * The imported rent is the rent at lease start; the engine applies every
 * increase since. When an increase has already been billed, "Rent today"
 * must match what the engine works out, so a landlord who typed today's
 * rent as the starting rent isn't billed the increases twice. Within half a
 * paisa per sq ft (a rate typed to the paisa) and a rupee (rounding).
 * Returns the row's message, or null when it's right. Pure.
 */
export function rentTodayProblem(
  lease: LeaseInput,
  billing: BillingSettings,
  rentToday: string,
  today: PlainDate,
): string | null {
  const charge = lease.charges.find((c) => c.type === "rent");
  if (
    !charge ||
    compareDates(today, lease.startDate) < 0 ||
    compareDates(today, lease.endDate) > 0
  )
    return null;
  const steps = amountSteps({
    charge,
    lease,
    rules: lease.escalationRules,
    custom: lease.customEscalations,
    settings: billing,
  });
  const at = steps.findLastIndex((s) => compareDates(s.from, today) <= 0);
  const typed = rentToday.trim();
  if (typed === "" && at <= 0) return null;
  const quarterly = charge.frequency === "quarterly";
  const monthly = (amount: number) =>
    quarterly ? mulDiv(amount, 1, 3) : amount;
  const expected = monthly(steps[Math.max(at, 0)]!.amount);
  const show = (paise: number) => `${formatINR(paise)} a month`;
  if (typed === "")
    return `Rent today (₹): this lease's rent has gone up since it started. Type the rent billed now, so the app can check the increases: from the rent at lease start they come to ${show(expected)}.`;
  const paise = rupeesToPaise(typed.replace(/,/g, ""));
  if (paise === null)
    return "Rent today (₹): type an amount in rupees, like 1,05,000 or 89.50.";
  const per =
    charge.basis === "fixed"
      ? paise
      : charge.basis === "per_sqft"
        ? monthly(chargeBaseAmount({ ...charge, ratePaise: paise }).amount)
        : null;
  if (per === null) return null;
  const tolerance =
    100 +
    (charge.basis === "per_sqft" ? Math.ceil(charge.areaHundredths / 200) : 0);
  if (Math.abs(per - expected) <= tolerance) return null;
  return `Rent today (₹): the rent at lease start with its increases comes to ${show(expected)} today, not ${formatINR(per)}. Type the rent from the lease's first month under Rent at lease start.`;
}

const FIELD_COLUMNS: Record<string, string> = {
  startDate: "Lease starts",
  endDate: "Last day",
  lockInEndDate: "Lock-in ends",
  noticePeriodMonths: "Notice (months)",
  rentFreeLength: "Rent-free",
  deposit: "Deposit (₹)",
  unitIds: "Units",
  tenantId: "Tenant name",
  buildingId: "Building name",
  rules: "Rent increase (%)",
};

/** The lease form's first error as a row message: "Last day: …". */
export function leaseErrorMessage(
  errors: LeaseFormErrors,
  sources: readonly ChargeSource[],
): string {
  const [key, message] = Object.entries(errors)[0] ?? [];
  if (!key || !message) return "Check this row.";
  const charge = /^charges\.(\d+)\./.exec(key);
  const column = charge
    ? sources[Number(charge[1])]
    : FIELD_COLUMNS[key.split(".")[0]!];
  return column ? `${column}: ${message}` : message;
}

export const TENANCY_TEMPLATE = {
  title: "Tenants and leases",
  intro: [
    "Type one tenant per row in the Tenants sheet, and one lease per row in the Leases sheet.",
    "Import buildings and units first: a lease names its building and units as they are in the app.",
    "A lease can be for a tenant already in the app: leave that tenant out of the Tenants sheet.",
    "Dates as DD-MM-YYYY. Amounts in rupees, before GST. GST rate, SAC code and billing timing come from each building's defaults.",
    "Leases with stepped rent, several rent charges or custom increases: import the simple part, then finish them in the lease form.",
    "Nothing is saved unless every row is right; the app lists each row to fix.",
  ],
  sheets: [
    {
      name: "Tenants",
      columns: TENANT_COLUMNS,
      help: {
        name: "As printed on their invoices",
        gstin: "Blank if they aren't GST-registered",
        pan: "Blank to take it from the GSTIN",
        address: "As printed on their invoices",
        state: "Blank to take it from the GSTIN",
        contactName: "Who receives invoices",
        email: "An email or a phone is needed",
        phone: "Like 98200 12345",
        whatsapp: "Yes to send reminders by WhatsApp; blank is No",
        deductsTds: "Yes or No; blank is Yes",
        tdsRate: "Blank is 10",
      },
      example: {
        name: "Acme Software Pvt Ltd",
        gstin: "27AABCA1234B1ZH",
        pan: "",
        address: "Andheri East, Mumbai",
        state: "",
        contactName: "Priya Shah",
        email: "accounts@acme.example",
        phone: "98200 12345",
        whatsapp: "Yes",
        deductsTds: "Yes",
        tdsRate: "10",
      },
    },
    {
      name: "Leases",
      columns: LEASE_COLUMNS,
      help: {
        tenant: "Exactly as in Tenants or the app",
        building: "Exactly as in the app",
        units: "Unit numbers, separated by commas",
        start: "DD-MM-YYYY",
        end: "The lease's last day, DD-MM-YYYY",
        lockIn:
          "Optional. The date before which the tenant can't leave, DD-MM-YYYY",
        notice:
          "Optional. How many months' notice either side must give, whole months",
        rentFreeMonths: "Optional; rent isn't billed for these months",
        rentFreeDays: "Optional; months or days, not both",
        deposit: "Optional, rupees",
        area: "Billed (default) or Carpet: which area the per sq ft amounts use",
        rent: "The rent in the lease's first month, before any increase: per sq ft per month, or the whole rent per month (billed quarterly, three months at a time)",
        rentToday:
          "Needed when the rent has already gone up: what you bill now, per sq ft or per month like the rent at lease start. The app checks it against the increases",
        rentBasis: '"per sq ft" (default) or "per month"',
        rentFrequency: "Monthly (default) or Quarterly",
        increase:
          "Optional, like 5 for 5%: rent goes up by this much every time",
        increaseEvery: "Blank is 12",
        increaseFrom:
          '"Lease start" (default) or "Rent start", as the lease deed says: with a rent-free period, rent start is later',
        camPerSqft: "Optional",
        camPerMonth: "Optional; per sq ft or per month, not both",
        parkingSlots: "Optional",
        parkingRate: "Per slot per month",
      },
      example: {
        tenant: "Acme Software Pvt Ltd",
        building: "Orchid Towers",
        units: "301, 302",
        start: "01-04-2025",
        end: "31-03-2030",
        lockIn: "31-03-2027",
        notice: "3",
        rentFreeMonths: "2",
        rentFreeDays: "",
        deposit: "6,00,000",
        area: "Billed",
        rent: "85.50",
        rentBasis: "per sq ft",
        rentFrequency: "Monthly",
        increase: "5",
        increaseEvery: "12",
        camPerSqft: "12",
        camPerMonth: "",
        parkingSlots: "2",
        parkingRate: "3,000",
      },
    },
  ],
} as const;
