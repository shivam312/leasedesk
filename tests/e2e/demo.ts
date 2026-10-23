// The Sharma Estates demo (src/lib/demo) for the walkthrough: reset it in the
// local database, and read back what the screens should show.

import { and, asc, eq, inArray, sum, count } from "drizzle-orm";
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
  const inOrg = (
    table:
      | typeof schema.tenants
      | typeof schema.invoices
      | typeof schema.leases
      | typeof schema.units,
  ) => eq(table.organizationId, organizationId);
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
    /** A tenant's invoice for `runMonth` ("2026-10-01") and its lines. */
    async invoice(tenantName: string, runMonth: string) {
      const tenantId = await this.tenantId(tenantName);
      const [inv] = await db
        .select()
        .from(schema.invoices)
        .where(
          and(
            inOrg(schema.invoices),
            eq(schema.invoices.tenantId, tenantId),
            eq(schema.invoices.runMonth, runMonth),
          ),
        );
      if (!inv) throw new Error(`${tenantName} has no invoice for ${runMonth}`);
      const lines = await db
        .select({
          type: schema.invoiceLines.chargeType,
          description: schema.invoiceLines.description,
          quantityLabel: schema.invoiceLines.quantityLabel,
          taxable: schema.invoiceLines.taxableAmount,
        })
        .from(schema.invoiceLines)
        .where(eq(schema.invoiceLines.invoiceId, inv.id))
        .orderBy(asc(schema.invoiceLines.position));
      return {
        taxable: inv.taxableTotal,
        cgst: inv.cgstTotal,
        sgst: inv.sgstTotal,
        roundOff: inv.roundOff,
        grandTotal: inv.grandTotal,
        expectedTds: inv.expectedTds,
        dueDate: inv.dueDate,
        lines,
      };
    },
    /** A tenant's lease: start, area, starting rent per sq ft and its increase rule. */
    async lease(tenantName: string) {
      const tenantId = await this.tenantId(tenantName);
      const [row] = await db
        .select({
          startDate: schema.leases.startDate,
          endDate: schema.leases.endDate,
          area: schema.leaseUnits.area,
          rentRate: schema.leaseCharges.rateOrAmount,
          percentBp: schema.escalationRules.percentBp,
          everyMonths: schema.escalationRules.everyMonths,
        })
        .from(schema.leases)
        .innerJoin(
          schema.leaseUnits,
          eq(schema.leaseUnits.leaseId, schema.leases.id),
        )
        .innerJoin(
          schema.leaseCharges,
          and(
            eq(schema.leaseCharges.leaseId, schema.leases.id),
            eq(schema.leaseCharges.type, "rent"),
          ),
        )
        .leftJoin(
          schema.escalationRules,
          eq(schema.escalationRules.leaseId, schema.leases.id),
        )
        .where(and(inOrg(schema.leases), eq(schema.leases.tenantId, tenantId)));
      if (!row) throw new Error(`${tenantName} has no lease`);
      return row;
    },
    /** How many invoices `runMonth` has, and their total. */
    async monthTotal(runMonth: string) {
      const [row] = await db
        .select({ n: count(), total: sum(schema.invoices.grandTotal) })
        .from(schema.invoices)
        .where(
          and(inOrg(schema.invoices), eq(schema.invoices.runMonth, runMonth)),
        );
      return { count: row?.n ?? 0, total: Number(row?.total ?? 0) };
    },
  };
}
