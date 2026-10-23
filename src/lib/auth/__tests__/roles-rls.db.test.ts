// The app's permission table and the database's write policies grant the
// same roles, so neither check is weaker than the other.

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  closeDb,
  hasTables,
  inRollback,
  skipDbTests,
} from "@/lib/db/__tests__/harness";
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

// Billing tables (M4): checked once their migration is applied. Drafts can
// be deleted by whoever bills; triggers refuse deleting anything sent.
const BILLING_TABLES = {
  invoice_series: { write: "manage_billing", delete: null },
  invoices: { write: "manage_billing", delete: "manage_billing" },
  invoice_lines: { write: "manage_billing", delete: "manage_billing" },
  credit_notes: { write: "manage_billing", delete: null },
  credit_note_lines: { write: "manage_billing", delete: null },
} satisfies typeof TABLE_PERMISSION;
if (await hasTables(...Object.keys(BILLING_TABLES)))
  Object.assign(TABLE_PERMISSION, BILLING_TABLES);

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
