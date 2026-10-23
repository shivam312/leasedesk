// docs/walkthrough/index.html (ROADMAP M5a): the walkthrough's screenshots
// in order, each with a paragraph for a non-technical reader saying what the
// user is doing, what to notice, and which rule or setting produced the
// numbers. The figures come from the run (the demo is built from today's
// date), so the words always match the pictures. Pure: manifest in, HTML out.

import { formatArea, formatDate, formatINR } from "@/lib/format";
import { DEMO_TENANTS, SPOTLIGHT } from "./plan";

export type WalkthroughShot = {
  n: number;
  file: string;
  step: string;
  name: string;
  width: number;
};

export type WalkthroughInvoice = {
  taxable: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
  expectedTds: number;
  dueDate: string;
  lines: {
    type: string;
    description: string;
    quantityLabel: string | null;
    taxable: number;
  }[];
};

export type WalkthroughFacts = {
  today: string;
  /** "Oct 2026" */
  month: string;
  email: string;
  kalinga: {
    lease: {
      startDate: string;
      area: number;
      rentRate: number;
      percentBp: number | null;
      everyMonths: number | null;
    };
    invoice: WalkthroughInvoice;
  };
  newLease: {
    unit: string;
    area: number;
    ratePaise: number;
    startDate: string;
  };
  made: { count: number; total: number };
  rangoli: { received: number; tds: number; numbers: string[] };
  statement: { count: number; received: number; tenants: string[] };
};

export type WalkthroughManifest = {
  facts: WalkthroughFacts;
  shots: WalkthroughShot[];
};

export const STEP_TITLES: Record<string, string> = {
  "1": "1. Log in and read Today",
  phone: "The same screens on a phone (375px wide)",
  "2": "2. Open a tenant and their lease",
  "3": "3. Add a new lease and see its rent schedule",
  "4": "4. Make this month's invoices, check one, send them all",
  "5": "5. Record a payment with TDS",
  "6": "6. Import a bank statement and confirm the matches",
  "7": "7. The reports",
};

const pct = (bp: number) => `${bp / 100}%`;
const rentLine = (f: WalkthroughFacts) =>
  f.kalinga.invoice.lines.find((l) => l.type === "rent");

/** Each screenshot's caption, by its name in the walkthrough test. */
export const CAPTIONS: Record<string, (f: WalkthroughFacts) => string> = {
  "log-in": (f) =>
    `The owner of Sharma Estates logs in with the demo login (${f.email}; <code>pnpm db:seed:demo</code> prints a new password each time). The demo has two buildings, the 8-floor Sharma Corporate Tower in Gurugram and Sharma Arcade in Bengaluru (shops below, offices above), with ${DEMO_TENANTS.length} tenants and invoices and payments up to last month.`,
  today: (f) =>
    `Today is the first screen after logging in: what's billed, collected and unpaid this month, then what needs doing. Notice the three tenants who haven't paid (${Object.keys(SPOTLIGHT.unpaid).join(", ")}), the reminder that ${f.month} invoices aren't made yet, the ${SPOTLIGHT.missingCertificates.length} TDS certificates past their due date (Q1's were due 15 August), coming rent increases, and ${SPOTLIGHT.expiringSoon}'s lease ending in 60 days. "Overdue" counts from each invoice's due date: 7 days after the invoice date in the tower and 10 in the arcade (setting <code>invoice.dueDays</code>, set on the arcade building).`,
  "phone-today": () =>
    `The same Today screen on a phone, as an owner would check it. The cards stack in one column and every button is big enough to tap.`,
  "phone-leases": () =>
    `The lease list on a phone: each lease is a card with the tenant, building, dates and status, instead of a wide table.`,
  tenants: () =>
    `Tenants lists everyone the landlord bills, with their GSTIN, accounts contact and whether they deduct TDS. Shops run by proprietors (Malnad Coffee House, Udupi Sagar Restaurant, Namma Pharmacy, Kumar Tailors) don't deduct TDS; companies and LLPs deduct 10%. Kumar Tailors isn't registered for GST, so it has no GSTIN.`,
  tenant: () =>
    `A tenant's page: their GSTIN and PAN, the TDS they deduct, their lease, every payment with the TDS kept back, and the accounts contact who receives invoices and reminders. The GSTIN's first two digits (06) are Haryana's state code, and characters 3 to 12 are the PAN.`,
  lease: (f) => {
    const l = f.kalinga.lease;
    const rent = rentLine(f);
    return `Kalinga Infotech's lease of ${formatArea(l.area)} started on ${formatDate(l.startDate)} at ${formatINR(l.rentRate)} per sq ft a month (${formatINR(Math.round((l.rentRate * l.area) / 100))}). The rent schedule shows every increase worked out in advance: ${l.percentBp ? `${pct(l.percentBp)} every ${l.everyMonths} months, compounding,` : "its increases"} each new rent rounded to the nearest rupee (setting <code>billing.roundIncreasedRent</code>). That is how this month's rent comes to ${rent ? formatINR(rent.taxable) : "the amount on the invoice"}.`;
  },
  "new-tenant": () =>
    `A new tenant, Lakshya Ventures, is added with their GSTIN and an accounts contact. A GSTIN with a wrong check digit (its last character) is refused, so typing mistakes are caught here and not on the invoice.`,
  "new-lease-units": (f) =>
    `The lease form, step 1: the tenant, the building and the units, here the empty office ${f.newLease.unit} on the 7th floor. A unit already leased on the new lease's dates is refused when saving.`,
  "new-lease-dates": (f) =>
    `Step 2: the lease runs nine years from ${formatDate(f.newLease.startDate)}, the 1st of next month, so it doesn't change this month's invoices.`,
  "new-lease-charges": (f) =>
    `Step 3: rent of ${formatINR(f.newLease.ratePaise)} per sq ft a month. GST (18%), the SAC code (997212) and billing in advance aren't typed: they come from the building's defaults.`,
  "new-lease-check": (f) =>
    `Step 4: everything is shown once more before saving, including the monthly rent: ${formatArea(f.newLease.area)} × ${formatINR(f.newLease.ratePaise)} = ${formatINR(Math.round((f.newLease.ratePaise * f.newLease.area) / 100))}.`,
  "new-lease-saved": () =>
    `The saved lease with its full rent schedule, month by month to the last day. Nothing else needs entering: from now on it's billed every month on its own.`,
  "invoices-made": (f) =>
    `"Make ${f.month} invoices" works out every lease's invoice for the month: ${f.made.count} drafts totalling ${formatINR(f.made.total)}. Nothing is sent yet, and drafts get their numbers only when they're sent, so a mistake caught now leaves no gap in the numbering.`,
  draft: (f) => {
    const i = f.kalinga.invoice;
    return `Kalinga Infotech's draft: ${i.lines.map((l) => `${l.description.split(" for ")[0]} ${formatINR(l.taxable)}`).join(", ")}, ${formatINR(i.taxable)} before GST. GST is CGST 9% + SGST 9% (${formatINR(i.cgst)} each) because the bill comes from Sharma Estates' Haryana GSTIN for a building in Haryana; a different state would mean IGST (rules section 8). The total is rounded to the rupee with a round-off line of ${formatINR(i.roundOff)} (setting <code>billing.roundInvoiceTotal</code>), giving ${formatINR(i.grandTotal)}. The tenant may keep back ${formatINR(i.expectedTds)} TDS: 10% of the amount before GST, rounded to the rupee (setting <code>tds.rounding</code>). It's due on ${formatDate(i.dueDate)}.`;
  },
  explain: () =>
    `Tapping a line explains the amount: the area times the rate per sq ft, whether it's a full or part month, and how the tax was split. This is what the accountant checks against the lease, line by line.`,
  "send-check": (f) =>
    `"Send ${f.made.count} invoices" asks once more, with the count and the total. Each invoice is checked against its lease again before it gets a number, so an invoice whose lease changed after it was made isn't sent.`,
  sent: () =>
    `Sent: each invoice now has its number: the building's prefix (SCT for the tower, SA for the arcade), the financial year (26-27) and a running number with no gaps, carrying on from last month's (setting <code>invoice.numberFormat</code>, rules section 9). Tenants with an email address get the invoice by email.`,
  payment: (f) =>
    `Rangoli Media Labs, three months behind, pays two of its invoices: ${formatINR(f.rangoli.received)} reaches the bank and ${formatINR(f.rangoli.tds)} is TDS they kept back. The payment goes to the oldest invoices first (${f.rangoli.numbers.join(" and ")}), each paid in full: what was received plus the TDS on it (rules section 11).`,
  "payment-recorded": () =>
    `The recorded payment. The TDS goes to the TDS tracker under this quarter, waiting for Rangoli's certificate.`,
  "bank-import": (f) =>
    `The landlord uploads the HDFC statement as it comes from net banking. The columns are recognised (date, narration, credit), and the ${f.statement.count} money-received lines are shown before importing; withdrawals are skipped.`,
  matches: (f) =>
    `Each credit is matched to a tenant from the name and invoice number in the bank's text (${f.statement.tenants.join(" and ")}), with the TDS worked out from the amount: the bank shows what arrived after TDS, so the TDS is the rest of the invoice.`,
  payments: (f) =>
    `"Record ${f.statement.count} payments" turns the matched lines into payments, ${formatINR(f.statement.received)} in all, each applied to the invoice named in its bank text. They're on the payments list with the one typed in by hand.`,
  reports: () =>
    `Reports: everything the landlord or their accountant asks for at month-end, each downloadable as Excel or PDF.`,
  "report-rent-roll": () =>
    `Rent roll: every running lease with its units, area, rent and rate per sq ft today (after all increases so far), its dates and its next rent increase.`,
  "report-vacancy": () =>
    `Vacancy: how much of each building is leased, and every empty unit. Office 703 shows the lease added in step 3 starting on the 1st; 704 is being fitted out.`,
  "report-expiry": () =>
    `Expiry schedule: leases ending in the next 12 months, soonest first, with the last day to give notice. ${SPOTLIGHT.expiringSoon} ends in 60 days; its 3-month notice day has already passed.`,
  "report-collections": () =>
    `Collections: money received this month, by payment and by tenant, with the TDS kept back shown separately: the hand-recorded payment from step 5 and the three from the bank statement. Received is what reached the bank; received plus TDS is what was settled.`,
  "report-ageing": () =>
    `Unpaid and ageing: what each tenant hasn't paid today, grouped by how long it has been overdue, and every unpaid invoice. Rangoli's two newest invoices are still here after step 5.`,
  "report-gst-summary": () =>
    `GST summary: a month's invoices and credit notes by GST rate, with CGST, SGST and IGST, and B2B (the tenant has a GSTIN) or B2C (Kumar Tailors), for the GST returns. The figures are copied from the sent invoices, never worked out again.`,
  "report-tds-summary": () =>
    `TDS summary: TDS kept back by each tenant, by quarter, and how much of it their Form 16A certificates cover. Q1's certificates were due on 15 August: ${SPOTLIGHT.missingCertificates.join(", ")} haven't sent theirs, so they show as overdue. Q2's aren't due until 15 November.`,
  "report-tally": () =>
    `Tally export: sent invoices, credit notes and payments between two dates, as a file the accountant imports into TallyPrime.`,
};

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

/** A caption's text, with figures and names escaped and `<code>` kept. */
export function caption(name: string, facts: WalkthroughFacts): string {
  const make = CAPTIONS[name];
  if (!make) return escapeHtml(`Screen: ${name.replace(/-/g, " ")}.`);
  return escapeHtml(make(facts))
    .replace(/&lt;code&gt;/g, "<code>")
    .replace(/&lt;\/code&gt;/g, "</code>");
}

/** The whole page. */
export function walkthroughPage({ facts, shots }: WalkthroughManifest): string {
  const sections: string[] = [];
  let step = "";
  for (const s of shots) {
    if (s.step !== step) {
      if (step) sections.push("</section>");
      step = s.step;
      sections.push(
        `<section><h2>${escapeHtml(STEP_TITLES[step] ?? step)}</h2>`,
      );
    }
    sections.push(
      `<figure id="shot-${s.n}"${s.width < 600 ? ' class="phone"' : ""}>
  <figcaption><span class="n">${s.n}</span> ${caption(s.name, facts)}</figcaption>
  <a href="${s.file}"><img src="${s.file}" alt="Screenshot ${s.n}: ${escapeHtml(s.name.replace(/-/g, " "))}" loading="lazy"></a>
</figure>`,
    );
  }
  if (step) sections.push("</section>");
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LeaseDesk walkthrough: a month at Sharma Estates</title>
<style>
  body { font: 16px/1.55 system-ui, sans-serif; color: #111; max-width: 960px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { margin-top: 3rem; border-top: 1px solid #ddd; padding-top: 1rem; }
  figure { margin: 1.5rem 0 2.5rem; }
  figcaption { margin-bottom: 0.75rem; }
  .n { display: inline-block; min-width: 1.8rem; font-weight: 600; color: #555; }
  img { width: 100%; border: 1px solid #ddd; border-radius: 6px; }
  figure.phone img { width: 320px; max-width: 100%; }
  code { background: #f3f3f3; padding: 0 4px; border-radius: 3px; font-size: 0.9em; }
  .meta { color: #555; }
</style>
</head>
<body>
<h1>A month at Sharma Estates</h1>
<p class="meta">Recorded on ${escapeHtml(formatDate(facts.today))} by <code>pnpm walkthrough</code>, on the demo data from <code>pnpm db:seed:demo</code>. All names, GSTINs and amounts are made up.</p>
<p>What a landlord's month looks like in LeaseDesk: checking Today, looking up a tenant, adding a lease, making and sending ${escapeHtml(facts.month)}'s invoices, recording payments by hand and from a bank statement, and the reports. Every number on these screens was worked out by the app from the leases; the captions say which rule or setting produced it (rules are in <code>docs/BILLING_RULES.md</code>, settings in <code>docs/SETTINGS.md</code>).</p>
<p>Videos of the whole run: <a href="videos/laptop.webm">on a laptop</a> and <a href="videos/phone.webm">on a phone</a>. They're made fresh by <code>pnpm walkthrough</code> and aren't kept in git, so run it once to see them.</p>
${sections.join("\n")}
</body>
</html>
`;
}
