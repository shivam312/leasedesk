// Roles (docs/PRODUCT_PLAN.md, "User roles and permissions"): what each is
// called on screen, and what it can do. Checked in every server action.

import type { Role } from "./membership";

export const ROLES: readonly Role[] = [
  "owner",
  "accounts",
  "property_manager",
  "viewer",
];

export const ROLE_LABELS: Record<Role, { label: string; description: string }> =
  {
    owner: {
      label: "Owner",
      description: "Everything, including team, settings and deleting records",
    },
    accounts: {
      label: "Accounts",
      description:
        "Invoices, payments, TDS and reports; can't change lease terms",
    },
    property_manager: {
      label: "Property manager",
      description:
        "Buildings, units, tenants and leases; can't record payments",
    },
    viewer: {
      label: "Viewer",
      description: "Can see everything and download reports; changes nothing",
    },
  };

/**
 * What each role may change (docs/PRODUCT_PLAN.md). Reading is open to every
 * active member. The row-level security write policies grant the same roles
 * (drizzle/0003_rls_policies.sql); a database test keeps the two in step.
 */
export const PERMISSIONS = {
  /** Invite people, change roles. */
  manage_team: ["owner"],
  /** Organization details, billing entities (GSTIN, bank, UPI), billing rules. */
  manage_settings: ["owner"],
  /** Buildings, floors and units. */
  manage_property: ["owner", "property_manager"],
  /** Tenants and their contacts (accounts edits GSTIN and TDS). */
  manage_tenants: ["owner", "accounts", "property_manager"],
  /** Lease terms (M3). */
  manage_leases: ["owner", "property_manager"],
  /** Invoices, credit notes, payments, TDS (M4–M5). */
  manage_billing: ["owner", "accounts"],
  /** Deleting records that aren't financial. */
  delete_records: ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** A refused action, with a message to show as it is. */
export class PermissionError extends Error {}

const DENIED: Record<Permission, string> = {
  manage_team: "Only an owner can invite people or change what they can do.",
  manage_settings: "Only an owner can change these settings.",
  manage_property:
    "Only an owner or property manager can change buildings and units.",
  manage_tenants:
    "Viewers can't change tenants. Ask an owner to change your access.",
  manage_leases: "Only an owner or property manager can change leases.",
  manage_billing: "Only an owner or accounts can change invoices and payments.",
  delete_records: "Only an owner can delete records.",
};

/** Throw a PermissionError unless `role` may do `permission`. */
export function requirePermission(
  member: { role: Role },
  permission: Permission,
): void {
  if (!can(member.role, permission))
    throw new PermissionError(DENIED[permission]);
}
