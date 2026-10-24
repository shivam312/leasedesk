// Times what each screen loads on the load-test organization (M10): the
// same functions the pages call, as the owner, twice (the first run warms
// the database's caches). A billing run is timed in a transaction that is
// rolled back, so the seed stays as it was.

import { desc, sql } from "drizzle-orm";
import { attentionInput, monthTotals } from "@/lib/alerts/queries";
import { needsAttention } from "@/lib/alerts/attention";
import {
  financialYear,
  monthOf,
  startOfMonth,
  type PlainDate,
} from "@/lib/billing/dates";
import * as schema from "@/lib/db/schema";
import {
  runAsSystem,
  runScoped,
  type OrgContext,
  type Transactional,
} from "@/lib/db/scoped";
import {
  invoicesForMonth,
  leasesWithoutInvoice,
  runBilling,
} from "@/lib/invoices/run";
import { ledgerFor } from "@/lib/payments/ledger";
import { REPORTS, type ReportParams } from "@/lib/reports/registry";

export type Timing = { screen: string; firstMs: number; againMs: number };

class Rollback extends Error {}

async function twice(fn: () => Promise<unknown>) {
  const times: number[] = [];
  for (let i = 0; i < 2; i++) {
    const t = performance.now();
    await fn();
    times.push(Math.round(performance.now() - t));
  }
  return { firstMs: times[0]!, againMs: times[1]! };
}

export async function timeLoad(
  db: Transactional,
  ctx: OrgContext,
  today: PlainDate,
): Promise<Timing[]> {
  const month = monthOf(today);
  const asUser = <T>(fn: Parameters<typeof runScoped<T>>[2]) =>
    runScoped(db, ctx, fn);
  // The tenant with the most ledger rows.
  const [busiest] = await asUser((s) =>
    s.tx
      .select({ id: schema.invoices.tenantId, n: sql<number>`count(*)` })
      .from(schema.invoices)
      .where(s.where(schema.invoices))
      .groupBy(schema.invoices.tenantId)
      .orderBy(desc(sql`count(*)`))
      .limit(1),
  );
  const params: ReportParams = {
    asOf: today,
    from: startOfMonth(month),
    to: today,
    month,
    financialYear: financialYear(today).label,
    today,
  };
  const out: Timing[] = [];
  const time = async (screen: string, fn: () => Promise<unknown>) =>
    out.push({ screen, ...(await twice(fn)) });

  await time("Today", () =>
    asUser(async (s) => {
      needsAttention(await attentionInput(s, today));
      await monthTotals(s, today);
    }),
  );
  await time("Billing (invoice list)", () =>
    asUser(async (s) => {
      await invoicesForMonth(s, month);
      await leasesWithoutInvoice(s, month);
    }),
  );
  await time("Tenant ledger", () => asUser((s) => ledgerFor(s, busiest!.id)));
  for (const r of REPORTS)
    await time(`Report: ${r.title}`, () => asUser((s) => r.load(s, params)));
  // Next month's billing run, rolled back.
  await time("Billing run (next month, rolled back)", async () => {
    try {
      await runAsSystem(db, ctx.organizationId, async (s) => {
        await runBilling(s, nextMonth(month));
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });
  return out;
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
