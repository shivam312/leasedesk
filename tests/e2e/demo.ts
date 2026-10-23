// The Sharma Estates demo (src/lib/demo) for the walkthrough: reset it in the
// local database, and read back what the screens should show.

import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/lib/db/schema";
import type { Transactional } from "../../src/lib/db/scoped";
import { assertLocalDatabase, databaseUrl } from "../../src/lib/db/url";
import { seedDemo } from "../../src/lib/demo/seed";

function connect() {
  const url = databaseUrl();
  assertLocalDatabase(url);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) };
}

/** Reset the demo organization and return its login. */
export async function resetDemo(today: string) {
  const { sql, db } = connect();
  try {
    return await seedDemo(db as unknown as Transactional, today);
  } finally {
    await sql.end();
  }
}

/** Run read-only queries against the demo organization. */
export async function readDemo<T>(
  organizationId: string,
  fn: (q: DemoQueries) => Promise<T>,
): Promise<T> {
  const { sql, db } = connect();
  try {
    return await fn(queries(db, organizationId));
  } finally {
    await sql.end();
  }
}

type Db = ReturnType<typeof connect>["db"];
export type DemoQueries = ReturnType<typeof queries>;

function queries(db: Db, organizationId: string) {
  const inOrg = (table: typeof schema.tenants | typeof schema.invoices) =>
    eq(table.organizationId, organizationId);
  return {
    async tenantId(name: string) {
      const [t] = await db
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(
          and(inOrg(schema.tenants), eq(schema.tenants.companyName, name)),
        );
      if (!t) throw new Error(`No demo tenant called ${name}`);
      return t.id;
    },
    /** A tenant's sent, unpaid invoices, oldest first. */
    async unpaidInvoices(tenantName: string) {
      const tenantId = await this.tenantId(tenantName);
      return db
        .select({
          id: schema.invoices.id,
          number: schema.invoices.number,
          invoiceDate: schema.invoices.invoiceDate,
          grandTotal: schema.invoices.grandTotal,
          expectedTds: schema.invoices.expectedTds,
        })
        .from(schema.invoices)
        .where(
          and(
            inOrg(schema.invoices),
            eq(schema.invoices.tenantId, tenantId),
            inArray(schema.invoices.status, ["sent", "overdue"]),
          ),
        )
        .orderBy(asc(schema.invoices.invoiceDate));
    },
  };
}
