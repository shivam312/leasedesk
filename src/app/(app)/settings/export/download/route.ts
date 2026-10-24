// Settings → Export all data: the zip (src/lib/exports/all-data.ts). Owner
// only; each download is logged.

import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { exportAllData } from "@/lib/exports/all-data";
import { supabaseStore } from "@/lib/files/supabase";
import { reportError } from "@/lib/monitoring";
import { todayInIndia } from "@/lib/today";

export async function GET() {
  const member = await requireMember();
  if (!can(member.role, "manage_settings"))
    return new Response("Only an owner can export all data.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  const today = todayInIndia();
  let zip: Uint8Array;
  try {
    const store = await supabaseStore();
    zip = await runScoped(appDb, member, (s) => exportAllData(s, store, today));
  } catch (error) {
    reportError("Export all data failed", error, {});
    return new Response(
      "We couldn't make the export. Go back to Settings and try again in a few minutes.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="leasedesk-data-${today}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
