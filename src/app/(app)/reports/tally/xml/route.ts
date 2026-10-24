// The Tally file for some dates. Downloading it records the export, so the
// next file with any of the same documents warns first.

import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { tallyXml } from "@/lib/exports/tally";
import {
  recordTallyExport,
  saveFirstPartyNames,
  tallyExportData,
} from "@/lib/exports/tally-data";
import { reportParams } from "@/lib/reports/registry";
import { todayInIndia } from "@/lib/today";
import { reportError } from "@/lib/monitoring";

export async function GET(req: Request) {
  const search = Object.fromEntries(new URL(req.url).searchParams);
  const { from, to } = reportParams(search, todayInIndia());
  const member = await requireMember();
  if (!can(member.role, "manage_billing"))
    return new Response(
      "Only an owner or accounts can make the Tally file. Ask them, or download the Excel instead.",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  let xml: string;
  try {
    xml = await runScoped(appDb, member, async (s) => {
      const { vouchers, documentIds, masters, unsavedParties } =
        await tallyExportData(s, from, to);
      await recordTallyExport(s, from, to, documentIds, vouchers.length);
      // Each tenant's Tally name stays what this first file called it.
      await saveFirstPartyNames(s, unsavedParties);
      return tallyXml(vouchers, masters);
    });
  } catch (error) {
    reportError("Tally export failed", error, { from, to });
    return new Response(
      "We couldn't make the Tally file. Check the ledger names in Settings → Tally and try again.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="tally-${from}-to-${to}.xml"`,
      "Cache-Control": "private, no-store",
    },
  });
}
