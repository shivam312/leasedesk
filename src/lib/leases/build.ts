// Checking a parsed lease against the database (units in the building, no
// unit leased twice) and building the engine's lease and critical dates from
// it, with the lease's resolved settings. The lease form and the Excel
// import both go through here, so an imported lease is saved exactly as the
// form would save it.

import type { Scoped } from "@/lib/db/scoped";
import { formatDate } from "@/lib/format";
import { loadSettings } from "@/lib/settings/store";
import { criticalDatesFor, type GeneratedCriticalDate } from "./critical-dates";
import {
  leaseInputFor,
  type BuiltLease,
  type LeaseDraft,
  type LeaseFormErrors,
  type LeaseFormStep,
} from "./draft";
import { unitClashes } from "./forms";
import { buildingUnits, unitBookings } from "./queries";

export type LeaseRefusal = {
  ok: false;
  errors: LeaseFormErrors;
  step: LeaseFormStep;
  message?: string;
};

/** Check the form against the database and build the engine's lease. */
export async function checkLease(
  s: Scoped,
  draft: LeaseDraft,
  replacesLeaseId: string | null,
  ids: { leaseId: string; chargeIds?: string[] },
): Promise<
  { ok: true; built: BuiltLease; dates: GeneratedCriticalDate[] } | LeaseRefusal
> {
  const { parties } = draft;
  const units = await buildingUnits(s, parties.buildingId);
  if (!parties.unitIds.every((id) => units.some((u) => u.id === id)))
    return {
      ok: false,
      step: "parties",
      errors: { unitIds: "Choose units in this building." },
    };
  const clashes = unitClashes(
    {
      id: ids.leaseId,
      replacesLeaseId,
      unitIds: parties.unitIds,
      startDate: draft.dates.startDate,
      endDate: draft.dates.endDate,
    },
    await unitBookings(s, parties.unitIds),
  );
  if (clashes.length > 0) {
    const c = clashes[0]!;
    const code = units.find((u) => u.id === c.unitId)?.code ?? "A unit";
    return {
      ok: false,
      step: "parties",
      errors: {
        unitIds: `Unit ${code} is already leased from ${formatDate(c.startDate)} to ${formatDate(c.endDate)}. Choose other units or change the dates.`,
      },
    };
  }
  const settings = await loadSettings(s, {
    buildingId: parties.buildingId,
    tenantId: parties.tenantId,
    leaseSettings: draft.settings,
  });
  try {
    const built = leaseInputFor(draft, {
      id: ids.leaseId,
      units,
      settings,
      chargeIds: ids.chargeIds,
    });
    const dates = criticalDatesFor(built.lease, built.billing, settings);
    return { ok: true, built, dates };
  } catch (error) {
    return {
      ok: false,
      step: "charges",
      errors: {},
      message:
        error instanceof Error
          ? `These terms can't be billed: ${error.message}`
          : "These terms can't be billed. Check the charges and rent increases.",
    };
  }
}
