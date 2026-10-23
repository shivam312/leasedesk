import { describe, expect, it } from "vitest";
import { shownStatus } from "../status";

const TODAY = "2026-10-24";

describe("shownStatus", () => {
  it("shows a sent invoice past its due date as overdue", () => {
    // Due 08-09-2026, 46 days ago, nothing paid: nothing ever stores "overdue".
    expect(shownStatus({ status: "sent", dueDate: "2026-09-08" }, TODAY)).toBe(
      "overdue",
    );
    expect(
      shownStatus({ status: "part_paid", dueDate: "2026-10-23" }, TODAY),
    ).toBe("overdue");
  });

  it("is not overdue on the due date itself", () => {
    expect(shownStatus({ status: "sent", dueDate: TODAY }, TODAY)).toBe("sent");
    expect(
      shownStatus({ status: "part_paid", dueDate: "2026-10-31" }, TODAY),
    ).toBe("part_paid");
  });

  it("goes by the balance, not the stored status, when it's known", () => {
    expect(
      shownStatus(
        { status: "sent", dueDate: "2026-09-08", outstandingPaise: 0 },
        TODAY,
      ),
    ).toBe("sent");
    // A stored "overdue" that isn't past due any more reads as sent.
    expect(
      shownStatus({ status: "overdue", dueDate: "2026-11-01" }, TODAY),
    ).toBe("sent");
  });

  it("leaves drafts, paid and credited invoices alone", () => {
    for (const status of ["draft", "paid", "cancelled"] as const)
      expect(shownStatus({ status, dueDate: "2026-01-01" }, TODAY)).toBe(
        status,
      );
  });
});
