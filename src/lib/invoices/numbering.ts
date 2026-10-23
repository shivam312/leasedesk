// Taking the next invoice or credit-note number (docs/BILLING_RULES.md
// section 9) [CA]. Call it inside the same transaction that sends the
// invoice: the series row stays locked until that transaction ends, and if
// sending fails the number is given back, so numbers have no gaps.

import { and, eq } from "drizzle-orm";
import { financialYear, type PlainDate } from "@/lib/billing/dates";
import { logActivity, updateLogged } from "@/lib/db/activity-log";
import { invoiceSeries } from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import { firstNumber, invoiceNumber } from "./number";

export async function takeNumber(
  s: Scoped,
  {
    billingEntityId,
    kind,
    prefix,
    date,
    format,
    startingNumber,
  }: {
    billingEntityId: string;
    kind: "invoice" | "credit_note";
    prefix: string;
    /** The invoice or credit-note date: decides the financial year. */
    date: PlainDate;
    /** invoice.numberFormat and invoice.startingNumber, resolved for the billing entity. */
    format: string;
    startingNumber: Record<string, number>;
  },
): Promise<{ seriesId: string; number: string }> {
  const fy = financialYear(date).short;
  const match = s.where(
    invoiceSeries,
    and(
      eq(invoiceSeries.billingEntityId, billingEntityId),
      eq(invoiceSeries.kind, kind),
      eq(invoiceSeries.financialYear, fy),
      eq(invoiceSeries.prefix, prefix),
    ),
  );
  const lock = () =>
    s.tx.select().from(invoiceSeries).where(match).for("update");
  let [series] = await lock();
  if (!series) {
    // First number of this series this year. If two sends race here, the
    // second insert waits for the first and then does nothing, and both lock
    // the same row, one after the other.
    const [created] = await s.tx
      .insert(invoiceSeries)
      .values(
        s.values({
          billingEntityId,
          kind,
          financialYear: fy,
          prefix,
          nextNumber: firstNumber(startingNumber, date),
        }),
      )
      .onConflictDoNothing()
      .returning();
    if (created)
      await logActivity(s, {
        entityType: "invoice_series",
        entityId: created.id,
        action: "create",
        after: created,
      });
    [series] = await lock();
  }
  if (!series) throw new Error("The number series couldn't be created");
  // Format first: a number too long for GST rules stops here, before the
  // series counts up.
  const number = invoiceNumber({
    format,
    prefix,
    invoiceDate: date,
    sequence: series.nextNumber,
  });
  await updateLogged(s, invoiceSeries, series.id, {
    nextNumber: series.nextNumber + 1,
  });
  return { seriesId: series.id, number };
}
