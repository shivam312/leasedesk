// Organization and people (docs/DATA_MODEL.md).

import {
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { id, settings, timestamps } from "./columns";

export const organizations = pgTable("organizations", {
  id: id(),
  name: text().notNull(),
  legalName: text(),
  pan: text(),
  logoPath: text(),
  settings: settings(),
  ...timestamps,
}).enableRLS();

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "accounts",
  "property_manager",
  "viewer",
]);

export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "removed",
]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Null until an invited person accepts and has a login.
    userId: uuid().references(() => authUsers.id, { onDelete: "restrict" }),
    // Lower-cased; who the invite was sent to, or the member's login email.
    email: text().notNull(),
    role: membershipRole().notNull(),
    invitedBy: uuid().references(() => authUsers.id, { onDelete: "restrict" }),
    // SHA-256 of the invite link's token, while the invite is open; cleared on accept.
    inviteTokenHash: text(),
    status: membershipStatus().notNull().default("invited"),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.userId),
    uniqueIndex().on(t.organizationId, t.email),
    uniqueIndex().on(t.organizationId, t.userId),
    uniqueIndex().on(t.inviteTokenHash),
  ],
).enableRLS();

export const billingEntities = pgTable(
  "billing_entities",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    legalName: text().notNull(),
    // Null for a landlord who isn't GST-registered.
    gstin: text(),
    // Two-digit GST state code, e.g. "27" for Maharashtra.
    stateCode: text().notNull(),
    address: text().notNull(),
    bankAccountName: text(),
    bankAccountNumber: text(),
    ifsc: text(),
    upiId: text(),
    settings: settings(),
    ...timestamps,
  },
  (t) => [index().on(t.organizationId), unique().on(t.organizationId, t.id)],
).enableRLS();
