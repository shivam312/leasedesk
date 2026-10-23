// Lease status in words, with a badge tone.

export const LEASE_STATUS = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "good" },
  in_notice: { label: "Leaving", tone: "warn" },
  expired: { label: "Ended", tone: "neutral" },
  terminated: { label: "Ended early", tone: "neutral" },
  renewed: { label: "Renewed", tone: "neutral" },
} as const;

export type LeaseStatus = keyof typeof LEASE_STATUS;
