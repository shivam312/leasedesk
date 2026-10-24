// The daily jobs' heartbeat (docs/DATA_MODEL.md, Supporting): one row each
// time a daily job finishes for an organization, from the scheduler or a
// "Run now". Today and Settings warn when the last one is more than a day
// old, so a stopped scheduler doesn't go unnoticed. Only the jobs (as the
// database owner, D22) write; members read (drizzle/0028).

import {
  boolean,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const jobName = pgEnum("job_name", ["billing", "reminders", "digest"]);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    organizationId: uuid().notNull(),
    job: jobName().notNull(),
    // The India date the run was for.
    runDate: date().notNull(),
    // false when it stopped with an error; `error` says what, for support.
    ok: boolean().notNull(),
    error: text(),
    // "schedule" or "run_now".
    source: text().notNull().default("schedule"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.job, t.runDate),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
  ],
).enableRLS();
