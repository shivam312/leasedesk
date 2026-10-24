import { describe, expect, it } from "vitest";
import { setupChecklist, type SetupFacts } from "../checklist";

const none: SetupFacts = {
  hasBusiness: false,
  unitCount: 0,
  leaseCount: 0,
  firstLeaseId: null,
  openingBalanceCount: 0,
  teamCount: 1,
  marked: [],
};

describe("setupChecklist", () => {
  it("lists the six steps in order, each linking to its screen, none done", () => {
    const list = setupChecklist(none);
    expect(list.steps.map((s) => [s.key, s.done])).toEqual([
      ["business", false],
      ["property", false],
      ["leases", false],
      ["schedule", false],
      ["opening", false],
      ["team", false],
    ]);
    expect(list.steps.map((s) => s.href)).toEqual([
      "/settings/business",
      "/leases/buildings",
      "/leases",
      "/leases",
      "/tenants",
      "/settings/team",
    ]);
    expect(list.complete).toBe(false);
    expect(list.doneCount).toBe(0);
  });

  it("ticks steps from the data, and the rest when marked done", () => {
    const list = setupChecklist({
      ...none,
      hasBusiness: true,
      unitCount: 12,
      leaseCount: 3,
      firstLeaseId: "L1",
      openingBalanceCount: 0,
      teamCount: 2,
      marked: ["schedule"],
    });
    expect(list.steps.filter((s) => !s.done).map((s) => s.key)).toEqual([
      "opening",
    ]);
    // Checking a schedule opens the first lease once there is one.
    expect(list.steps.find((s) => s.key === "schedule")?.href).toBe(
      "/leases/L1",
    );
    expect(list.doneCount).toBe(5);
    expect(
      setupChecklist({
        ...none,
        hasBusiness: true,
        unitCount: 1,
        leaseCount: 1,
        firstLeaseId: "L1",
        marked: ["schedule", "opening", "team"],
      }).complete,
    ).toBe(true);
  });

  it("only steps without data to show it can be marked done by hand", () => {
    const list = setupChecklist(none);
    expect(list.steps.filter((s) => s.canMark).map((s) => s.key)).toEqual([
      "opening",
      "team",
    ]);
    // A schedule can't be checked before there is a lease.
    expect(
      setupChecklist({ ...none, leaseCount: 1, firstLeaseId: "L1" }).steps.find(
        (s) => s.key === "schedule",
      )?.canMark,
    ).toBe(true);
  });
});

describe("setupChecklist business step", () => {
  it("is done by any business, GSTIN or not, so an unregistered landlord can finish", () => {
    const [step] = setupChecklist({ ...none, hasBusiness: true }).steps;
    if (!step) throw new Error("no steps");
    expect(step.key).toBe("business");
    expect(step.done).toBe(true);
    expect(step.title).toBe("Business details");
  });
});
