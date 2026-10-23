// Reads for the tenant screens, always through runScoped/withOrg.

import { and, asc, desc, eq } from "drizzle-orm";
import { tenantContacts, tenants } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";

export async function listTenants(s: Scoped) {
  return s.tx
    .select({
      id: tenants.id,
      companyName: tenants.companyName,
      gstin: tenants.gstin,
      stateCode: tenants.stateCode,
      deductsTdsRent: tenants.deductsTdsRent,
      contactName: tenantContacts.name,
      contactEmail: tenantContacts.email,
      contactPhone: tenantContacts.phone,
    })
    .from(tenants)
    .leftJoin(
      tenantContacts,
      and(
        eq(tenantContacts.tenantId, tenants.id),
        eq(tenantContacts.isPrimary, true),
      ),
    )
    .where(s.where(tenants))
    .orderBy(asc(tenants.companyName));
}

export async function getTenant(s: Scoped, id: string) {
  const [tenant] = await s.tx
    .select()
    .from(tenants)
    .where(s.where(tenants, eq(tenants.id, id)));
  if (!tenant) return null;
  const contacts = await s.tx
    .select()
    .from(tenantContacts)
    .where(s.where(tenantContacts, eq(tenantContacts.tenantId, id)))
    .orderBy(desc(tenantContacts.isPrimary), asc(tenantContacts.name));
  return { tenant, contacts };
}
