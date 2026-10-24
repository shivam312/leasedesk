// The setup checklist on Today (M10): the steps a landlord takes on day one,
// each ticked from their data or, where the data can't show it, marked done
// by hand. Today shows it until every step is done. Pure.

export const SETUP_STEPS = [
  "business",
  "property",
  "leases",
  "schedule",
  "opening",
  "team",
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number];

/** Steps the data can't show, so they're marked done by hand. */
export const MARKABLE_STEPS = ["schedule", "opening", "team"] as const;
export type MarkableStep = (typeof MARKABLE_STEPS)[number];

export type SetupFacts = {
  /** A business (billing entity), with a GSTIN or not registered for GST. */
  hasBusiness: boolean;
  unitCount: number;
  /** Leases that aren't drafts. */
  leaseCount: number;
  firstLeaseId: string | null;
  openingBalanceCount: number;
  /** People in the organization, invited or joined, including the owner. */
  teamCount: number;
  /** Steps someone marked done ("setup_done" in the activity log). */
  marked: readonly string[];
};

export type SetupStep = {
  key: SetupStepKey;
  title: string;
  detail: string;
  href: string;
  /** The link's words. */
  action: string;
  done: boolean;
  /** Shows a "Mark done" (or "Skip") button. */
  canMark: boolean;
  markLabel?: string;
};

export function setupChecklist(f: SetupFacts): {
  steps: SetupStep[];
  doneCount: number;
  complete: boolean;
} {
  const marked = new Set(f.marked);
  const steps: SetupStep[] = [
    {
      key: "business",
      title: "Business details",
      detail:
        "The name, address, bank details and GSTIN (if registered) printed on invoices.",
      href: "/settings/business",
      action: "Add business details",
      done: f.hasBusiness,
      canMark: false,
    },
    {
      key: "property",
      title: "Buildings and units",
      detail: "Each building and the units you rent out.",
      href: "/leases/buildings",
      action: "Add buildings",
      done: f.unitCount > 0,
      canMark: false,
    },
    {
      key: "leases",
      title: "Tenants and leases",
      detail: "Type them in, or import them all from Excel.",
      href: "/leases",
      action: "Go to leases",
      done: f.leaseCount > 0,
      canMark: false,
    },
    {
      key: "schedule",
      title: "Check one rent schedule",
      detail:
        "Open a lease and compare its rent schedule with what you bill today.",
      href: f.firstLeaseId ? `/leases/${f.firstLeaseId}` : "/leases",
      action: "Open a lease",
      done: marked.has("schedule"),
      canMark: f.firstLeaseId !== null,
      markLabel: "Yes, the schedule is right",
    },
    {
      key: "opening",
      title: "Opening balances",
      detail:
        "What each tenant still owes from before, on their tenant page (or in the import).",
      href: "/tenants",
      action: "Open tenants",
      done: f.openingBalanceCount > 0 || marked.has("opening"),
      canMark: true,
      markLabel: "Nobody owes anything",
    },
    {
      key: "team",
      title: "Invite your team",
      detail: "Your accountant or property manager, with their own login.",
      href: "/settings/team",
      action: "Invite someone",
      done: f.teamCount > 1 || marked.has("team"),
      canMark: true,
      markLabel: "Just me for now",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps: steps.map((s) => ({ ...s, canMark: s.canMark && !s.done })),
    doneCount,
    complete: doneCount === steps.length,
  };
}
