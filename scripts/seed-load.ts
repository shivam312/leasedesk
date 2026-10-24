// pnpm db:seed:load: reset and load the "Load Test Estates" organization
// (src/lib/demo/load.ts), then time what each screen loads on it
// (src/lib/demo/load-timing.ts). `pnpm db:seed:load --time-only` times the
// organization already there. Local databases only.

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import type { Transactional } from "../src/lib/db/scoped";
import { demoPassword } from "../src/lib/demo/seed";
import { LOAD_EMAIL, LOAD_ORG_NAME, seedLoad } from "../src/lib/demo/load";
import { timeLoad } from "../src/lib/demo/load-timing";
import { todayInIndia } from "../src/lib/today";
import { connectForScript } from "./db-env";

async function main() {
  const { sql, where } = connectForScript();
  if (where !== "local database")
    throw new Error(
      "The load seed deletes and rebuilds an organization, so it only runs against the local database.",
    );
  const db = drizzle(sql, { schema, casing: "snake_case" });
  const today = todayInIndia();
  try {
    let ctx: { userId: string; organizationId: string };
    if (process.argv.includes("--time-only")) {
      const [m] = await db
        .select({
          userId: schema.memberships.userId,
          organizationId: schema.memberships.organizationId,
        })
        .from(schema.memberships)
        .innerJoin(
          schema.organizations,
          eq(schema.organizations.id, schema.memberships.organizationId),
        )
        .where(eq(schema.memberships.email, LOAD_EMAIL));
      if (!m?.userId)
        throw new Error(
          `No ${LOAD_ORG_NAME} yet: run pnpm db:seed:load first.`,
        );
      ctx = { userId: m.userId, organizationId: m.organizationId };
    } else {
      const password = demoPassword().replace("sharma-", "load-");
      const r = await seedLoad(
        db as unknown as Transactional,
        today,
        password,
        (line) => console.info(line),
      );
      console.info(
        `Seeded ${LOAD_ORG_NAME}: ${r.invoices} invoices, ${r.payments} payments in ${r.seconds}s.\nLog in as ${LOAD_EMAIL} / ${r.password}`,
      );
      ctx = { userId: r.userId, organizationId: r.organizationId };
    }
    const timings = await timeLoad(db as unknown as Transactional, ctx, today);
    console.info(
      "\n| Screen | First load (ms) | Again (ms) |\n| --- | --- | --- |",
    );
    for (const t of timings)
      console.info(`| ${t.screen} | ${t.firstMs} | ${t.againMs} |`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
