import { activityLine } from "@/lib/activity/describe";
import { activityFor } from "@/lib/activity/queries";
import { appDb, requireMember } from "@/lib/auth";
import { runScoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { todayInIndia } from "@/lib/today";

const time = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "Activity": who changed what and when, folded so the page stays short. */
export function ActivitySection({
  entries,
}: {
  entries: Awaited<ReturnType<typeof activityFor>>;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="max-w-2xl">
      <details className="rounded-lg border px-4 py-2">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold md:min-h-0">
          Activity ({entries.length === 25 ? "latest 25" : entries.length})
        </summary>
        <ul className="flex flex-col divide-y pb-2 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-2">
              <span className="break-words">{activityLine(e)}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatDate(todayInIndia(e.at))} {time.format(e.at)} ·{" "}
                {e.who ?? "LeaseDesk (automatic)"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The section for a record and anything logged under its id (e.g. its emails). */
export async function RecordActivity({ ids }: { ids: string[] }) {
  const member = await requireMember();
  const entries = await runScoped(appDb, member, (s) => activityFor(s, ids));
  return <ActivitySection entries={entries} />;
}
