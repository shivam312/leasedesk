// A report as an Excel file, with the same filters and search as the screen.

import { notFound } from "next/navigation";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { reportWorkbook } from "@/lib/exports/xlsx";
import {
  exportFileName,
  findReport,
  reportParams,
  searchReport,
} from "@/lib/reports/registry";
import { todayInIndia } from "@/lib/today";

export async function GET(
  req: Request,
  ctx: RouteContext<"/reports/[report]/xlsx">,
) {
  const { report: slug } = await ctx.params;
  const def = findReport(slug);
  if (!def) notFound();
  const search = Object.fromEntries(new URL(req.url).searchParams);
  const p = reportParams(search, todayInIndia());
  const member = await requireMember();
  const report = searchReport(
    await runScoped(appDb, member, (s) => def.load(s, p)),
    search.q ?? "",
  );
  return new Response(new Uint8Array(reportWorkbook(report)), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(def, p, "xlsx")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
