import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActive } from "../nav-items";

describe("NAV_ITEMS", () => {
  it("has exactly the five sections from the UX principles", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Today",
      "Leases",
      "Tenants",
      "Billing",
      "Reports",
    ]);
  });
});

describe("isActive", () => {
  it("matches the section and its sub-pages", () => {
    expect(isActive("/leases", "/leases")).toBe(true);
    expect(isActive("/leases", "/leases/123")).toBe(true);
  });

  it("doesn't match other sections or a shared prefix", () => {
    expect(isActive("/leases", "/tenants")).toBe(false);
    expect(isActive("/leases", "/leases-archive")).toBe(false);
    expect(isActive("/leases", null)).toBe(false);
  });
});
