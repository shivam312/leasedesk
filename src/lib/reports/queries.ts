// Loading what each report needs, for the current organization. Building the
// report from it is pure (rent-roll.ts, vacancy.ts and the rest).

import { and, asc, eq, gte, inArray, lte, ne, notInArray } from "drizzle-orm";
import {
  endOfMonth,
  startOfMonth,
  type PlainDate,
  type YearMonth,
} from "@/lib/billing/dates";
import { trackerRecords } from "@/lib/tds/certificates";
import {
  buildings,
  creditNoteLines,
  creditNotes,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  customEscalations,
  escalationRules,
  floors,
  leaseCharges,
  leases,
  leaseUnits,
  tenants,
  units,
} from "@/lib/db/schema";
import { openInvoiceRows } from "@/lib/alerts/queries";
import type { Scoped } from "@/lib/db/scoped";
import { savedLeaseInput } from "@/lib/leases/rows";
import { billingSettings } from "@/lib/settings/billing";
import { loadSettings } from "@/lib/settings/store";
import { ageing, collections } from "./collections";
import { gstSummary, type GstDocument, type GstLine } from "./gst-summary";
import type { Report } from "./report";
import { tdsSummary } from "./tds-summary";
import { expirySchedule } from "./expiry";
import { rentRoll, type RentRollLease } from "./rent-roll";
import { vacancy } from "./vacancy";

/** Every saved (not draft) lease with its terms and resolved settings. */
export async function rentRollLeases(s: Scoped): Promise<RentRollLease[]> {
  const rows = await s.tx
    .select({
      lease: leases,
      tenantName: tenants.companyName,
      building: {
        id: buildings.id,
        name: buildings.name,
        entity: buildings.billingEntityId,
      },
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(buildings, eq(buildings.id, leases.buildingId))
    .where(s.where(leases, ne(leases.status, "draft")));
  const ids = rows.map((r) => r.lease.id);
  if (ids.length === 0) return [];
  const [unitRows, charges, rules, customs] = await Promise.all([
    s.tx
      .select({
        leaseId: leaseUnits.leaseId,
        code: units.code,
        area: leaseUnits.area,
      })
      .from(leaseUnits)
      .innerJoin(units, eq(units.id, leaseUnits.unitId))
      .where(s.where(leaseUnits, inArray(leaseUnits.leaseId, ids)))
      .orderBy(asc(units.code)),
    s.tx
      .select()
      .from(leaseCharges)
      .where(s.where(leaseCharges, inArray(leaseCharges.leaseId, ids)))
      .orderBy(leaseCharges.createdAt, leaseCharges.id),
    s.tx
      .select()
      .from(escalationRules)
      .where(s.where(escalationRules, inArray(escalationRules.leaseId, ids))),
    s.tx
      .select()
      .from(customEscalations)
      .where(
        s.where(customEscalations, inArray(customEscalations.leaseId, ids)),
      ),
  ]);
  const result: RentRollLease[] = [];
  for (const { lease, tenantName, building } of rows) {
    const own = unitRows.filter((u) => u.leaseId === lease.id);
    const settings = billingSettings(
      await loadSettings(s, {
        billingEntityId: building.entity,
        buildingId: building.id,
        tenantId: lease.tenantId,
        leaseSettings: lease.settings,
      }),
    );
    result.push({
      leaseId: lease.id,
      status: lease.status,
      tenantName,
      buildingName: building.name,
      unitCodes: own
        .map((u) => u.code)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
      area: own.reduce((t, u) => t + u.area, 0),
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentStartsOn: lease.rentCommencementDate,
      lockInEndDate: lease.lockInEndDate,
      noticePeriodMonths: lease.noticePeriodMonths,
      depositPaise: lease.depositAmount,
      input: savedLeaseInput(
        lease,
        own,
        charges.filter((c) => c.leaseId === lease.id),
        rules.filter((r) => r.leaseId === lease.id),
        customs.filter((c) => c.leaseId === lease.id),
      ),
      settings,
    });
  }
  return result;
}

export async function rentRollReport(
  s: Scoped,
  asOf: PlainDate,
): Promise<Report> {
  return rentRoll(await rentRollLeases(s), asOf);
}

export async function vacancyReport(
  s: Scoped,
  asOf: PlainDate,
): Promise<Report> {
  const [unitRows, leaseRows] = await Promise.all([
    s.tx
      .select({
        id: units.id,
        buildingName: buildings.name,
        floorLabel: floors.label,
        code: units.code,
        area: units.chargeableArea,
        status: units.status,
      })
      .from(units)
      .innerJoin(buildings, eq(buildings.id, units.buildingId))
      .leftJoin(floors, eq(floors.id, units.floorId))
      .where(s.where(units)),
    s.tx
      .select({
        unitId: leaseUnits.unitId,
        status: leases.status,
        startDate: leases.startDate,
        endDate: leases.endDate,
      })
      .from(leaseUnits)
      .innerJoin(leases, eq(leases.id, leaseUnits.leaseId))
      .where(s.where(leaseUnits, ne(leases.status, "draft"))),
  ]);
  return vacancy(unitRows, leaseRows, asOf);
}

export async function collectionsReport(
  s: Scoped,
  from: PlainDate,
  to: PlainDate,
): Promise<Report> {
  const rows = await s.tx
    .select({
      id: payments.id,
      kind: payments.kind,
      receivedDate: payments.receivedDate,
      tenantId: payments.tenantId,
      tenantName: tenants.companyName,
      mode: payments.mode,
      reference: payments.reference,
      amountReceived: payments.amountReceived,
      tdsDeducted: payments.tdsDeducted,
    })
    .from(payments)
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .where(
      s.where(
        payments,
        and(gte(payments.receivedDate, from), lte(payments.receivedDate, to)),
      ),
    );
  const ids = rows.map((r) => r.id);
  const allocated =
    ids.length === 0
      ? []
      : await s.tx
          .select({
            paymentId: paymentAllocations.paymentId,
            number: invoices.number,
          })
          .from(paymentAllocations)
          .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
          .where(
            s.where(
              paymentAllocations,
              inArray(paymentAllocations.paymentId, ids),
            ),
          );
  return collections(
    rows.map((r) => ({
      ...r,
      invoiceNumbers: [
        ...new Set(
          allocated
            .filter((a) => a.paymentId === r.id && a.number)
            .map((a) => a.number!),
        ),
      ].sort(),
    })),
    from,
    to,
  );
}

/** Unpaid as recorded now, aged to `today`. */
export async function ageingReport(
  s: Scoped,
  today: PlainDate,
): Promise<Report> {
  const open = await openInvoiceRows(s);
  const ids = open.map((o) => o.id);
  const details =
    ids.length === 0
      ? []
      : await s.tx
          .select({
            id: invoices.id,
            number: invoices.number,
            invoiceDate: invoices.invoiceDate,
          })
          .from(invoices)
          .where(s.where(invoices, inArray(invoices.id, ids)));
  const byId = new Map(details.map((d) => [d.id, d]));
  return ageing(
    open.map((o) => ({
      tenantId: o.tenantId,
      tenantName: o.tenantName,
      number: byId.get(o.id)?.number ?? "",
      invoiceDate: byId.get(o.id)?.invoiceDate ?? o.dueDate,
      dueDate: o.dueDate,
      outstandingPaise: o.outstandingPaise,
      expectedTdsPaise: o.expectedTdsPaise,
    })),
    today,
  );
}

/** Sent invoices dated in `month` and credit notes issued in it. [CA] (D-026) */
export async function gstSummaryReport(
  s: Scoped,
  month: YearMonth,
): Promise<Report> {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const [invoiceRows, creditRows] = await Promise.all([
    s.tx
      .select()
      .from(invoices)
      .where(
        s.where(
          invoices,
          notInArray(invoices.status, ["draft"]),
          gte(invoices.invoiceDate, from),
          lte(invoices.invoiceDate, to),
        ),
      ),
    s.tx
      .select({ note: creditNotes, invoice: invoices })
      .from(creditNotes)
      .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
      .where(
        s.where(
          creditNotes,
          gte(creditNotes.date, from),
          lte(creditNotes.date, to),
        ),
      ),
  ]);
  const invoiceIds = invoiceRows.map((i) => i.id);
  const noteIds = creditRows.map((c) => c.note.id);
  const [lines, noteLines] = await Promise.all([
    invoiceIds.length === 0
      ? []
      : s.tx
          .select()
          .from(invoiceLines)
          .where(
            s.where(invoiceLines, inArray(invoiceLines.invoiceId, invoiceIds)),
          ),
    noteIds.length === 0
      ? []
      : s.tx
          .select()
          .from(creditNoteLines)
          .where(
            s.where(
              creditNoteLines,
              inArray(creditNoteLines.creditNoteId, noteIds),
            ),
          ),
  ]);
  const gstLine = (l: {
    gstRateBp: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
  }): GstLine => ({
    gstRateBp: l.gstRateBp,
    taxable: l.taxableAmount,
    cgst: l.cgst,
    sgst: l.sgst,
    igst: l.igst,
  });
  const docs: GstDocument[] = [
    ...invoiceRows.map((i) => ({
      kind: "invoice" as const,
      supplierGstin: i.supplier?.gstin ?? "",
      number: i.number ?? "",
      date: i.invoiceDate,
      recipientName: i.recipient?.companyName ?? "",
      recipientGstin: i.recipient?.gstin ?? null,
      placeOfSupply: i.placeOfSupply,
      value: i.grandTotal,
      lines: lines.filter((l) => l.invoiceId === i.id).map(gstLine),
    })),
    ...creditRows.map(({ note, invoice }) => ({
      kind: "credit_note" as const,
      supplierGstin: invoice.supplier?.gstin ?? "",
      number: note.number,
      date: note.date,
      recipientName: invoice.recipient?.companyName ?? "",
      recipientGstin: invoice.recipient?.gstin ?? null,
      placeOfSupply: invoice.placeOfSupply,
      value: note.total,
      invoiceNumber: invoice.number ?? "",
      invoiceDate: invoice.invoiceDate,
      lines: noteLines.filter((l) => l.creditNoteId === note.id).map(gstLine),
    })),
  ];
  return gstSummary(docs, month);
}

export async function tdsSummaryReport(
  s: Scoped,
  financialYear: string,
  today: PlainDate,
): Promise<Report> {
  const records = await trackerRecords(s, financialYear);
  const ids = [...new Set(records.map((r) => r.tenantId))];
  const pans =
    ids.length === 0
      ? []
      : await s.tx
          .select({ id: tenants.id, pan: tenants.pan })
          .from(tenants)
          .where(s.where(tenants, inArray(tenants.id, ids)));
  return tdsSummary(
    records,
    new Map(pans.map((p) => [p.id, p.pan])),
    financialYear,
    today,
  );
}

export async function expiryReport(
  s: Scoped,
  asOf: PlainDate,
): Promise<Report> {
  return expirySchedule(await rentRollLeases(s), asOf);
}
