// pnpm db:seed: load the demo organization (2 buildings, 40 tenants, 45 leases).
// The tables arrive in M2 and M3; each schema task adds its rows here (db-change skill).

import { connectForScript } from "./db-env";

async function main() {
  const { sql, where } = connectForScript();
  try {
    await sql`select 1`;
    console.info(
      `Connected to the ${where}. Nothing to seed yet: demo data arrives with the M2 schema.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
