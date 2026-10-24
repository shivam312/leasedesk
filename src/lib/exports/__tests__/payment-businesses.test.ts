import { describe, expect, it } from "vitest";
import { paymentBusinesses } from "../tally-data";

describe("paymentBusinesses", () => {
  it("is the one business a payment's allocations are all to, or null for more than one", () => {
    const owner = paymentBusinesses([
      { paymentId: "p1", entityId: "gstin-a" },
      { paymentId: "p1", entityId: "gstin-a" },
      { paymentId: "p2", entityId: "gstin-a" },
      { paymentId: "p2", entityId: "gstin-b" },
    ]);
    expect(owner.get("p1")).toBe("gstin-a");
    expect(owner.get("p2")).toBeNull();
    // On account (no allocations): not in the map.
    expect(owner.has("p3")).toBe(false);
  });
});
