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
