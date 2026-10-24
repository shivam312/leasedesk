// A tenant's statement of account as a PDF: the ledger for a financial year
// (?fy=2026-27) from the balance brought forward, or everything.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { renderReportPdf } from "@/lib/exports/pdf";
import { reportError } from "@/lib/monitoring";
import { ledgerFor } from "@/lib/payments/ledger";
import {
  ledgerForYear,
  parseFinancialYear,
  statementReport,
} from "@/lib/payments/statement";
import { getTenant } from "@/lib/tenants/queries";
import { todayInIndia } from "@/lib/today";

export async function GET(
  req: Request,
  ctx: RouteContext<"/tenants/[id]/ledger/pdf">,
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const fy = parseFinancialYear(new URL(req.url).searchParams.get("fy"));
  const member = await requireMember();
  const data = await runScoped(appDb, member, async (s) => {
    const found = await getTenant(s, id);
    return found && { tenant: found.tenant, ledger: await ledgerFor(s, id) };
  });
  if (!data) notFound();
  const report = statementReport(
    data.tenant.companyName,
    ledgerForYear(data.ledger, fy),
  );
  let pdf: Buffer;
  try {
    pdf = await renderReportPdf(report, todayInIndia());
  } catch (error) {
    reportError("Statement PDF failed", error, { tenantId: id });
    return new Response(
      "We couldn't make the statement PDF. Go back to the ledger and try again.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  const name = data.tenant.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${name}-${fy ?? "all"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
