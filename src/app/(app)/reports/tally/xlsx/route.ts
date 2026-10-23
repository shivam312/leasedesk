// The Tally vouchers as an Excel sheet of entries, for accountants who don't
// use Tally. Nothing is recorded: it isn't imported anywhere.

import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { tallyEntriesReport } from "@/lib/exports/tally";
import { tallyExportData } from "@/lib/exports/tally-data";
import { reportWorkbook } from "@/lib/exports/xlsx";
import { formatDate } from "@/lib/format";
import { reportParams } from "@/lib/reports/registry";
import { todayInIndia } from "@/lib/today";

export async function GET(req: Request) {
  const search = Object.fromEntries(new URL(req.url).searchParams);
  const { from, to } = reportParams(search, todayInIndia());
  const member = await requireMember();
  const { vouchers } = await runScoped(appDb, member, (s) =>
    tallyExportData(s, from, to),
  );
  const report = tallyEntriesReport(
    vouchers,
    `${formatDate(from)} to ${formatDate(to)}`,
  );
  return new Response(new Uint8Array(reportWorkbook(report)), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="accounting-entries-${from}-to-${to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
