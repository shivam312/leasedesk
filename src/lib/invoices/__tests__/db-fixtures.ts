// Database fixtures for sending: a draft made by the real billing run, so it
// matches its lease when issueInvoice checks it.

import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { runScoped, type Transactional } from "@/lib/db/scoped";
import { seedOrg } from "@/lib/db/__tests__/fixtures";
import type { TestTx } from "@/lib/db/__tests__/harness";
import { runBilling } from "../run";

/**
 * `seedOrg` with a GSTIN and its lease active, and November 2026's draft
 * made by runBilling: rent 1,300 sq ft × ₹90 = ₹1,17,000, CGST and SGST 9%
 * = ₹10,530 each, total ₹1,38,060.
 */
export async function madeDraft(tx: TestTx, name = "A") {
  const a = await seedOrg(tx, name);
  await tx
    .update(schema.billingEntities)
    .set({ gstin: "27AAPFU0939F1ZV" })
    .where(eq(schema.billingEntities.id, a.entity.id));
  await tx
    .update(schema.leases)
    .set({ status: "active" })
    .where(eq(schema.leases.id, a.lease.id));
  const ctx = { userId: a.userId, organizationId: a.org.id };
  await runScoped(tx as unknown as Transactional, ctx, (s) =>
    runBilling(s, "2026-11"),
  );
  const [invoice] = await tx
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.leaseId, a.lease.id));
  const [line] = await tx
    .select()
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, invoice!.id));
  return { a, ctx, invoice: invoice!, line: line! };
}
