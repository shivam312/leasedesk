// Loading and saving the `settings` jsonb columns. Server code only; reads and
// writes go through withOrg (row-level security) and saves are logged.

import { eq } from "drizzle-orm";
import { logActivity, updateLogged } from "@/lib/db/activity-log";
import {
  billingEntities,
  buildings,
  organizations,
  tenants,
} from "@/lib/db/schema";
import type { Scoped } from "@/lib/db/scoped";
import {
  resolveSettings,
  resolveWithSources,
  type SettingLayers,
} from "./resolve";
import {
  onlyOverrides,
  parseStoredSettings,
  type Settings,
  type StoredSettings,
} from "./schema";

export interface SettingsFor {
  billingEntityId?: string;
  buildingId?: string;
  tenantId?: string;
  /** The lease's `settings` jsonb, until leases are loaded here (M3). */
  leaseSettings?: unknown;
}

async function settingsOf(
  s: Scoped,
  table: typeof billingEntities | typeof buildings | typeof tenants,
  id: string | undefined,
): Promise<unknown> {
  if (!id) return undefined;
  const [row] = await s.tx
    .select({ settings: table.settings })
    .from(table)
    .where(s.where(table, eq(table.id, id)));
  if (!row) throw new Error(`${id} isn't in this organization`);
  return row.settings;
}

/** The stored layers for the given building, tenant, lease and billing entity. */
export async function loadLayers(
  s: Scoped,
  target: SettingsFor = {},
): Promise<SettingLayers> {
  const [org] = await s.tx
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, s.organizationId));
  if (!org) throw new Error("Organization not found");
  return {
    organization: org.settings,
    billingEntity: await settingsOf(s, billingEntities, target.billingEntityId),
    building: await settingsOf(s, buildings, target.buildingId),
    tenant: await settingsOf(s, tenants, target.tenantId),
    lease: target.leaseSettings,
  };
}

export async function loadSettings(
  s: Scoped,
  target: SettingsFor = {},
): Promise<Settings> {
  return resolveSettings(await loadLayers(s, target));
}

export async function loadSettingsWithSources(
  s: Scoped,
  target: SettingsFor = {},
) {
  return resolveWithSources(await loadLayers(s, target));
}

export type SettingsOwner =
  | { scope: "organization" }
  | { scope: "billing_entity"; id: string }
  | { scope: "building"; id: string }
  | { scope: "tenant"; id: string };

/**
 * Replace one level's stored overrides with `values`, validated for that
 * level; a key left out follows the level above again. Logged. Never changes a sent invoice: settings only affect
 * drafts and future invoices.
 */
export async function saveSettings(
  s: Scoped,
  owner: SettingsOwner,
  values: StoredSettings,
): Promise<StoredSettings> {
  const parsed = parseStoredSettings(owner.scope, values);
  // At the organization level a value equal to the default means "follow the
  // default", so it isn't stored. Lower down, a stored value means "set here",
  // even if it equals the default: a building may need the default back when
  // its organization changed it.
  const stored =
    owner.scope === "organization" ? onlyOverrides(parsed) : parsed;
  const table = {
    organization: organizations,
    billing_entity: billingEntities,
    building: buildings,
    tenant: tenants,
  }[owner.scope];
  if (owner.scope === "organization") {
    // organizations is keyed by id rather than organization_id.
    const [before] = await s.tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, s.organizationId));
    const [after] = await s.tx
      .update(organizations)
      .set({ settings: stored })
      .where(eq(organizations.id, s.organizationId))
      .returning();
    if (!before || !after)
      throw new Error("Only an owner can change organization settings");
    await logActivity(s, {
      entityType: "organizations",
      entityId: s.organizationId,
      action: "update",
      before: { settings: before.settings },
      after: { settings: after.settings },
    });
    return stored;
  }
  const updated = await updateLogged(s, table as typeof buildings, owner.id, {
    settings: stored,
  });
  if (!updated) throw new Error("You can't change these settings");
  return stored;
}
