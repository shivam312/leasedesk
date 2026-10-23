import { describe, expect, it } from "vitest";
import {
  can,
  PermissionError,
  PERMISSIONS,
  requirePermission,
  ROLES,
} from "../roles";

describe("roles (docs/PRODUCT_PLAN.md)", () => {
  // role → permissions it has
  const expected = {
    owner: Object.keys(PERMISSIONS),
    accounts: ["manage_tenants", "manage_billing"],
    property_manager: ["manage_property", "manage_tenants", "manage_leases"],
    viewer: [],
  };

  it.each(ROLES)("%s can do exactly what the product plan says", (role) => {
    const granted = Object.keys(PERMISSIONS).filter((p) =>
      can(role, p as keyof typeof PERMISSIONS),
    );
    expect(granted.sort()).toEqual([...expected[role]].sort());
  });

  it("accounts can't edit lease terms or manage the team", () => {
    expect(can("accounts", "manage_leases")).toBe(false);
    expect(can("accounts", "manage_team")).toBe(false);
  });

  it("a property manager can't record payments", () => {
    expect(can("property_manager", "manage_billing")).toBe(false);
  });

  it("requirePermission throws a plain-words error", () => {
    expect(() =>
      requirePermission({ role: "viewer" }, "manage_tenants"),
    ).toThrow(PermissionError);
    expect(() =>
      requirePermission({ role: "viewer" }, "manage_tenants"),
    ).toThrow(
      "Viewers can't change tenants. Ask an owner to change your access.",
    );
    expect(() =>
      requirePermission({ role: "owner" }, "manage_team"),
    ).not.toThrow();
  });
});
