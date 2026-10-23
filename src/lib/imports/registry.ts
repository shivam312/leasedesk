// The import templates by the name in their download address.

import { PROPERTY_TEMPLATE } from "./property";
import { TENANCY_TEMPLATE } from "./tenancy";

export const IMPORT_TEMPLATES = {
  "buildings-and-units": PROPERTY_TEMPLATE,
  "tenants-and-leases": TENANCY_TEMPLATE,
} as const;
