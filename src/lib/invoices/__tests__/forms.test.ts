import { describe, expect, it } from "vitest";
import { billingMonth, monthChoices, runSummary } from "../forms";

const base = {
  runMonth: "2026-11",
  drafted: 0,
  alreadySent: 0,
  nothingToBill: 0,
  problems: [],
};

describe("billing month", () => {
  it("uses ?month= when it's a real month, else this month", () => {
    expect(billingMonth("2026-12", "2026-11-15")).toBe("2026-12");
    expect(billingMonth("2026-13", "2026-11-15")).toBe("2026-11");
    expect(billingMonth(undefined, "2026-11-15")).toBe("2026-11");
  });

  it("offers last month, this month and next month, across a year end", () => {
    expect(monthChoices("2026-12-31")).toEqual([
      { value: "2026-11", label: "Nov 2026" },
      { value: "2026-12", label: "Dec 2026" },
      { value: "2027-01", label: "Jan 2027" },
    ]);
  });
});

describe("runSummary", () => {
  it("counts the invoices made", () => {
    expect(runSummary({ ...base, drafted: 38 })).toEqual({
      message: "Made 38 invoices for Nov 2026. Check them, then send.",
      tone: "success",
      problems: [],
    });
    expect(runSummary({ ...base, drafted: 1 }).message).toMatch(
      /Made 1 invoice for/,
    );
  });

  it("is an error only when problems stopped every invoice", () => {
    const problems = [
      { leaseId: "l", tenantName: "Acme", message: "Add the GSTIN." },
    ];
    expect(runSummary({ ...base, problems }).tone).toBe("error");
  });

  it("says when there is nothing to bill", () => {
    expect(runSummary(base).message).toBe(
      "No leases need an invoice for Nov 2026. Check that each lease has started and has its rent set.",
    );
  });

  it("mentions invoices already sent and every problem", () => {
    const summary = runSummary({
      ...base,
      drafted: 2,
      alreadySent: 1,
      problems: [
        { leaseId: "l", tenantName: "Acme", message: "Add the GSTIN." },
      ],
    });
    expect(summary).toEqual({
      message:
        "Made 2 invoices for Nov 2026. Check them, then send. 1 tenant was already sent Nov 2026's invoice; it wasn't changed.",
      tone: "success",
      problems: ["Acme: Add the GSTIN."],
    });
  });
});
