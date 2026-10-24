// The header's search: tenants (name, GSTIN), units (number) and invoices
// (number), each scoped to the organization, a few of each.

import { and, asc, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { buildings, invoices, tenants, units } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

/** `%q%` with LIKE's wildcards escaped, or null for a blank search. */
export function likePattern(q: string): string | null {
  const t = q.trim();
  return t ? `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
}

export async function globalSearch(s: Scoped, q: string, limit = 10) {
  const like = likePattern(q);
  if (!like) return { tenants: [], units: [], invoices: [] };
  const [t, u, i] = await Promise.all([
    s.tx
      .select({
        id: tenants.id,
        name: tenants.companyName,
        gstin: tenants.gstin,
      })
      .from(tenants)
      .where(
        s.where(
          tenants,
          or(ilike(tenants.companyName, like), ilike(tenants.gstin, like)),
        ),
      )
      .orderBy(asc(tenants.companyName))
      .limit(limit),
    s.tx
      .select({
        id: units.id,
        code: units.code,
        buildingId: buildings.id,
        building: buildings.name,
      })
      .from(units)
      .innerJoin(buildings, eq(buildings.id, units.buildingId))
      .where(s.where(units, ilike(units.code, like)))
      .orderBy(asc(buildings.name), asc(units.code))
      .limit(limit),
    s.tx
      .select({
        id: invoices.id,
        number: invoices.number,
        tenant: tenants.companyName,
        grandTotal: invoices.grandTotal,
        invoiceDate: invoices.invoiceDate,
      })
      .from(invoices)
      .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
      .where(
        s.where(
          invoices,
          and(isNotNull(invoices.number), ilike(invoices.number, like)),
        ),
      )
      .orderBy(desc(invoices.invoiceDate))
      .limit(limit),
  ]);
  return { tenants: t, units: u, invoices: i };
}
