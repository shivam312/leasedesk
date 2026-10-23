// pnpm db:seed:demo: reset and load the "Sharma Estates" demo organization
// (src/lib/demo), and print its login. Local databases only.

import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import type { Transactional } from "../src/lib/db/scoped";
import { seedDemo } from "../src/lib/demo/seed";
import { formatMonth } from "../src/lib/format";
import { todayInIndia } from "../src/lib/today";
import { connectForScript } from "./db-env";

async function main() {
  const { sql, where } = connectForScript();
  if (where !== "local database")
    throw new Error(
      "The demo seed deletes and rebuilds an organization, so it only runs against the local database.",
    );
  const db = drizzle(sql, { schema, casing: "snake_case" });
  try {
    const r = await seedDemo(db as unknown as Transactional, todayInIndia());
    const months = r.months.map(formatMonth);
    console.info(
      [
        `Seeded Sharma Estates into the ${where}:`,
        `  ${r.invoices} invoices sent for ${months[0]} to ${months.at(-1)}, ${r.payments} payments recorded`,
        `  ${r.unpaid} invoices unpaid, ${r.certificatesMissing} TDS certificates missing`,
        "",
        `Log in at http://localhost:3000/login`,
        `  Email:    ${r.email}`,
        `  Password: ${r.password}`,
      ].join("\n"),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
