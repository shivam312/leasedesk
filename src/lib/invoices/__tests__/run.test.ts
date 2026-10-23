import { describe, expect, it } from "vitest";
import { billedLeaseIds } from "../run";

describe("billedLeaseIds", () => {
  it("counts a lease as billed once its invoice is past draft, credited in full included", () => {
    const billed = billedLeaseIds([
      { leaseId: "draft", status: "draft" },
      { leaseId: "sent", status: "sent" },
      { leaseId: "paid", status: "paid" },
      // Waived in full by a credit note: making the month again must not
      // bill it a second time.
      { leaseId: "credited", status: "cancelled" },
    ]);
    expect([...billed].sort()).toEqual(["credited", "paid", "sent"]);
  });
});
