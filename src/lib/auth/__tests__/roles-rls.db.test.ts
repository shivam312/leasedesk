// The app's permission table and the database's write policies grant the
// same roles, so neither check is weaker than the other.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, inRollback, skipDbTests } from "@/lib/db/__tests__/harness";
import { PERMISSIONS, type Permission } from "../roles";

const TABLE_PERMISSION: Record<
  string,
  { write: Permission; delete: Permission | null }
> = {
  organizations: { write: "manage_settings", delete: null },
  memberships: { write: "manage_team", delete: null },
  billing_entities: { write: "manage_settings", delete: "delete_records" },
  buildings: { write: "manage_property", delete: "delete_records" },
  floors: { write: "manage_property", delete: "delete_records" },
  units: { write: "manage_property", delete: "delete_records" },
  tenants: { write: "manage_tenants", delete: "delete_records" },
  tenant_contacts: { write: "manage_tenants", delete: "delete_records" },
};

describe.skipIf(skipDbTests)("permissions match row-level security", () => {
  afterAll(closeDb);

  it.each(Object.entries(TABLE_PERMISSION))(
    "%s: write and delete policies name the same roles",
    async (table, { write, delete: del }) => {
      await inRollback(async (tx) => {
        const rows = await tx.execute<{
          cmd: string;
          check: string | null;
          qual: string | null;
        }>(sql`
          select cmd, with_check as check, qual from pg_policies
          where schemaname = 'public' and tablename = ${table}`);
        const roles = (text: string | null | undefined) =>
          [...(text?.match(/\{([a-z_,]+)\}/)?.[1]?.split(",") ?? [])].sort();
        const policy = (cmd: string) => [...rows].find((r) => r.cmd === cmd);

        expect(roles(policy("UPDATE")?.qual)).toEqual(
          [...PERMISSIONS[write]].sort(),
        );
        if (table !== "organizations")
          expect(roles(policy("INSERT")?.check)).toEqual(
            [...PERMISSIONS[write]].sort(),
          );
        if (del)
          expect(roles(policy("DELETE")?.qual)).toEqual(
            [...PERMISSIONS[del]].sort(),
          );
        else expect(policy("DELETE")).toBeUndefined();
      });
    },
  );
});
