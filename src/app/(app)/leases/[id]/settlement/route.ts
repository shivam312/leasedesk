// The deposit settlement statement for a lease, as a PDF: unpaid dues after
// TDS, less payment credit the tenant already holds, less the deposit held,
// and what's left to refund or still owed.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { sumPaise } from "@/lib/billing/money";
import { renderReportPdf } from "@/lib/exports/pdf";
import { getLease } from "@/lib/leases/queries";
import { reportError } from "@/lib/monitoring";
import { depositLedger } from "@/lib/payments/deposits";
import {
  paymentSettings,
  paymentsWithCredit,
  unpaidInvoices,
} from "@/lib/payments/payments";
import { settlementReport } from "@/lib/payments/statement";
import { amountToAsk } from "@/lib/reminders/schedule";
import { todayInIndia } from "@/lib/today";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/leases/[id]/settlement">,
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await requireMember();
  const today = todayInIndia();
  const data = await runScoped(appDb, member, async (s) => {
    const saved = await getLease(s, id);
    if (!saved) return null;
    const tenantId = saved.lease.tenantId;
    const [deposit, open, credits] = await Promise.all([
      depositLedger(s, id),
      unpaidInvoices(s, tenantId, await paymentSettings(s, tenantId)),
      paymentsWithCredit(s, tenantId),
    ]);
    return {
      saved,
      deposit,
      // The tenant's opening balance (D-028) belongs to no lease; like their
      // credit, it is the tenant's, so it is settled on this statement too.
      open: open.filter((o) => o.leaseId === id || o.openingBalance),
      creditPaise: sumPaise(credits.map((c) => c.creditPaise)),
    };
  });
  if (!data) notFound();
  const { report } = settlementReport({
    tenantName: data.saved.tenantName,
    property: `${data.saved.units.map((u) => u.code).join(", ")}, ${data.saved.buildingName}`,
    asOf: today,
    heldPaise: data.deposit.heldPaise,
    creditPaise: data.creditPaise,
    unpaid: data.open.map((o) => ({
      number: o.number,
      dueDate: o.dueDate,
      outstandingPaise: o.outstandingPaise,
      toPayPaise: amountToAsk(o),
    })),
  });
  let pdf: Buffer;
  try {
    pdf = await renderReportPdf(report, today);
  } catch (error) {
    reportError("Settlement PDF failed", error, { leaseId: id });
    return new Response(
      "We couldn't make the settlement statement. Go back to the lease and try again.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="deposit-settlement-${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
