// Renewal: a new version of the lease, never an edit of the old one
// (docs/PRODUCT_PLAN.md: "Leases are versioned, never overwritten").
// The new version starts the day after the old one ends, for the same
// tenant and units, with the old terms as a template. When it's activated,
// the old version's status becomes `renewed`.

import {
  addDays,
  addMonths,
  compareDates,
  type PlainDate,
} from "@/lib/billing/dates";
import { formatDate } from "@/lib/format";
import type { BillingSettings } from "@/lib/billing/types";
import {
  leaseTemplate,
  type LeaseTemplate,
  type LeaseTemplateSource,
} from "./copy";

export type RenewableLease = LeaseTemplateSource & {
  id: string;
  tenantId: string;
  unitIds: string[];
  version: number;
  endDate: PlainDate;
  status:
    "draft" | "active" | "in_notice" | "expired" | "terminated" | "renewed";
};

export type RenewalDraft = LeaseTemplate & {
  tenantId: string;
  unitIds: string[];
  version: number;
  replacesLeaseId: string;
  startDate: PlainDate;
  endDate: PlainDate;
};

/**
 * Why a lease with `status` can't be renewed, or null when it can: only a
 * current, leaving or expired lease is renewed. A lease ended early has no
 * tenant left to renew with; that's a new lease.
 */
export function renewalRefusal(
  status: RenewableLease["status"],
): string | null {
  switch (status) {
    case "draft":
      return "A draft lease can't be renewed; edit it instead.";
    case "renewed":
      return "This lease has already been renewed.";
    case "terminated":
      return "This lease was ended early, so it can't be renewed. Add a new lease instead.";
    default:
      return null;
  }
}

/**
 * A draft renewal for `termMonths` (the form suggests the old term and the
 * user can change it). A renewal has no rent-free period unless one is added.
 */
export function renewalDraft(
  lease: RenewableLease,
  termMonths: number,
  settings: Pick<BillingSettings, "monthEndRule">,
): RenewalDraft {
  const refusal = renewalRefusal(lease.status);
  if (refusal) throw new Error(refusal);
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error("Enter the renewal term in whole months.");
  }
  const startDate = addDays(lease.endDate, 1);
  return {
    ...leaseTemplate(lease),
    rentFreeMonths: 0,
    rentFreeDays: 0,
    tenantId: lease.tenantId,
    unitIds: [...lease.unitIds],
    version: lease.version + 1,
    replacesLeaseId: lease.id,
    startDate,
    endDate: addDays(
      addMonths(startDate, termMonths, settings.monthEndRule),
      -1,
    ),
  };
}

/**
 * A renewal must start after the version it replaces ends, or the same
 * units would be billed twice for the overlapping days. Null when it's fine.
 */
export function renewalStartProblem(
  oldEndDate: PlainDate,
  newStartDate: PlainDate,
): string | null {
  return compareDates(newStartDate, oldEndDate) > 0
    ? null
    : `The renewal must start after the current lease ends on ${formatDate(oldEndDate)}.`;
}
