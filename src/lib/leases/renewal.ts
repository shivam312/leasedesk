// Renewal: a new version of the lease, never an edit of the old one
// (docs/PRODUCT_PLAN.md: "Leases are versioned, never overwritten").
// The new version starts the day after the old one ends, for the same
// tenant and units, with the old terms as a template. When it's activated,
// the old version's status becomes `renewed`.

import { addDays, addMonths, type PlainDate } from "@/lib/billing/dates";
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
 * A draft renewal for `termMonths` (the form suggests the old term and the
 * user can change it). A renewal has no rent-free period unless one is added.
 */
export function renewalDraft(
  lease: RenewableLease,
  termMonths: number,
  settings: Pick<BillingSettings, "monthEndRule">,
): RenewalDraft {
  if (lease.status === "draft" || lease.status === "renewed") {
    throw new Error(
      lease.status === "draft"
        ? "A draft lease can't be renewed; edit it instead."
        : "This lease has already been renewed.",
    );
  }
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
