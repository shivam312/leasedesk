// A report as a PDF, with the same filters and search as the screen.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { renderReportPdf } from "@/lib/exports/pdf";
import {
  exportFileName,
  findReport,
  reportParams,
  searchReport,
} from "@/lib/reports/registry";
import { todayInIndia } from "@/lib/today";
import { reportError } from "@/lib/monitoring";

export async function GET(
  req: Request,
  ctx: RouteContext<"/reports/[report]/pdf">,
) {
  const { report: slug } = await ctx.params;
  const def = findReport(slug);
  if (!def) notFound();
  const search = Object.fromEntries(new URL(req.url).searchParams);
  const today = todayInIndia();
  const p = reportParams(search, today);
  const member = await requireMember();
  const report = searchReport(
    await runScoped(appDb, member, (s) => def.load(s, p)),
    search.q ?? "",
  );
  let pdf: Buffer;
  try {
    pdf = await renderReportPdf(report, today);
  } catch (error) {
    reportError("Report PDF failed", error, { report: slug });
    return new Response(
      "We couldn't make this PDF. Go back to the report and try again, or download it as Excel.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFileName(def, p, "pdf")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
