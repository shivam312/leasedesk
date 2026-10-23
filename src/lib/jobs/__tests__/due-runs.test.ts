import { describe, expect, it } from "vitest";
import { dueRuns } from "../due-runs";

describe("dueRuns", () => {
  const orgs = [
    { id: "first", settings: {} },
    { id: "late", settings: { "invoice.runDay": 25 } },
  ];

  it("bills organizations on their run day only", () => {
    expect(dueRuns(orgs, "2026-11-01")).toEqual([
      { organizationId: "first", month: "2026-11" },
    ]);
    expect(dueRuns(orgs, "2026-11-25")).toEqual([
      { organizationId: "late", month: "2026-12" },
    ]);
    expect(dueRuns(orgs, "2026-11-10")).toEqual([]);
  });

  it("skips an organization with an invalid stored setting, not the others", () => {
    const broken = { id: "broken", settings: { "invoice.runDay": 40 } };
    expect(dueRuns([broken, ...orgs], "2026-11-01")).toEqual([
      { organizationId: "first", month: "2026-11" },
    ]);
  });
});
