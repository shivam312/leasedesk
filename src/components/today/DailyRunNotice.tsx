import { appDb, requireMember } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { runScoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { dailyRunLate } from "@/lib/jobs/health";
import { todayInIndia } from "@/lib/today";
import { runDailyNow } from "@/server/actions/jobs";
import { DailyRunWarning } from "./DailyRunWarning";

/** The warning when the daily run is more than a day late; nothing otherwise. */
export async function DailyRunNotice() {
  const member = await requireMember();
  const late = await runScoped(appDb, member, (s) =>
    dailyRunLate(s, todayInIndia()),
  );
  if (!late) return null;
  return (
    <DailyRunWarning
      sinceLabel={formatDate(late)}
      canRun={can(member.role, "manage_billing")}
      action={runDailyNow}
    />
  );
}
