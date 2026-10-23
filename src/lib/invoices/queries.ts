// Reading one invoice with its lines, for the invoice page and the PDF.

import { asc, eq, sum } from "drizzle-orm";
import {
  billingEntities,
  buildings,
  creditNotes,
  invoiceLines,
  invoices,
  leaseUnits,
  tenants,
  units,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { invoiceDocument } from "./document";

export async function getInvoice(s: Scoped, id: string) {
  const [row] = await s.tx
    .select({
      invoice: invoices,
      tenant: tenants,
      building: buildings,
      entity: billingEntities,
    })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .innerJoin(buildings, eq(buildings.id, invoices.buildingId))
    .innerJoin(
      billingEntities,
      eq(billingEntities.id, invoices.billingEntityId),
    )
    .where(s.where(invoices, eq(invoices.id, id)));
  if (!row) return null;
  const lines = await s.tx
    .select()
    .from(invoiceLines)
    .where(s.where(invoiceLines, eq(invoiceLines.invoiceId, id)))
    .orderBy(asc(invoiceLines.position));
  return { ...row, lines };
}

export type SavedInvoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/** Unit codes of a lease, for the invoice's property line. */
export async function leaseUnitCodes(s: Scoped, leaseId: string) {
  const rows = await s.tx
    .select({ code: units.code })
    .from(leaseUnits)
    .innerJoin(units, eq(units.id, leaseUnits.unitId))
    .where(s.where(leaseUnits, eq(leaseUnits.leaseId, leaseId)));
  return rows.map((r) => r.code);
}

/** What the invoice PDF prints, or null when there's no such invoice. */
export async function getInvoiceDocument(s: Scoped, id: string) {
  const saved = await getInvoice(s, id);
  if (!saved) return null;
  const unitCodes = await leaseUnitCodes(s, saved.invoice.leaseId);
  const [credit] = await s.tx
    .select({ total: sum(creditNotes.total).mapWith(Number) })
    .from(creditNotes)
    .where(s.where(creditNotes, eq(creditNotes.invoiceId, id)));
  return invoiceDocument({ ...saved, unitCodes, credited: credit?.total ?? 0 });
}
