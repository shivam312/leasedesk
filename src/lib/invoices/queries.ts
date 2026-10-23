// Reading one invoice with its lines, for the invoice page and the PDF.

import { asc, eq } from "drizzle-orm";
import {
  billingEntities,
  buildings,
  invoiceLines,
  invoices,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

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
