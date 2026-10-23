// What the billing engine says each demo lease bills in a month, worked out
// from the demo plan alone (plan.ts), not from what the seed saved. The
// walkthrough test compares the screens with this, so a lease saved wrongly,
// a setting resolved wrongly or an amount shown wrongly all fail it. Pure.

import { draftInvoice, type DraftInvoice } from "@/lib/billing/draft-invoice";
import type { PlainDate, YearMonth } from "@/lib/billing/dates";
import { supplyType } from "@/lib/billing/gst";
import type { LeaseInput } from "@/lib/billing/schedule";
import { tenantTdsDefaults } from "@/lib/billing/tds";
import type { Charge } from "@/lib/billing/types";
import { billingSettings } from "@/lib/settings/billing";
import { chargeDefaults } from "@/lib/settings/charge-defaults";
import { defaultSettings } from "@/lib/settings/schema";
import {
  DEMO_BUILDINGS,
  DEMO_ENTITIES,
  DEMO_TENANTS,
  demoLeases,
} from "./plan";

/** Each demo tenant's invoice for `runMonth`, as the engine works it out; tenants with nothing to bill are left out. */
export function expectedDemoInvoices(
  today: PlainDate,
  runMonth: YearMonth,
): Map<string, DraftInvoice> {
  const out = new Map<string, DraftInvoice>();
  for (const plan of demoLeases(today)) {
    const building = DEMO_BUILDINGS.find((b) => b.key === plan.building)!;
    const unit = building.floors.flatMap((f) => f.units)[plan.unitIndex]!;
    const area =
      plan.areaBasis === "carpet" ? unit.carpetArea : unit.chargeableArea;
    // Default settings, with the building's own (the arcade's due days).
    const settings = { ...defaultSettings(), ...building.settings };
    const defaults = chargeDefaults(settings);
    const charge = (
      id: string,
      type: Charge["type"],
      amount:
        | { basis: "per_sqft"; ratePaise: number; areaHundredths: number }
        | { basis: "per_slot"; ratePaise: number; slots: number },
      waivedDuringRentFree: boolean,
    ): Charge => ({
      id,
      type,
      ...amount,
      startDate: plan.startDate,
      frequency: "monthly",
      timing: defaults.timing,
      gstRateBp: defaults.gstRateBp,
      sacCode: defaults.sacCode,
      waivedDuringRentFree,
    });
    const lease: LeaseInput = {
      id: plan.tenant,
      startDate: plan.startDate,
      endDate: plan.endDate,
      rentFreeMonths: plan.rentFreeMonths,
      rentFreeDays: 0,
      charges: [
        charge(
          "rent",
          "rent",
          { basis: "per_sqft", ratePaise: plan.rentRate, areaHundredths: area },
          true,
        ),
        charge(
          "cam",
          "cam",
          { basis: "per_sqft", ratePaise: plan.camRate, areaHundredths: area },
          false,
        ),
        ...(plan.parkingSlots
          ? [
              charge(
                "parking",
                "parking",
                {
                  basis: "per_slot",
                  ratePaise: plan.parkingRate,
                  slots: plan.parkingSlots,
                },
                false,
              ),
            ]
          : []),
      ],
      escalationRules: [
        {
          ...plan.escalation,
          anchor: plan.rentFreeMonths ? "rent_commencement" : "lease_start",
          compounding: true,
        },
      ],
    };
    const tenant = DEMO_TENANTS.find((t) => t.name === plan.tenant)!;
    const draft = draftInvoice({
      lease,
      runMonth,
      settings: billingSettings(settings),
      supply: supplyType({
        billingGstin: DEMO_ENTITIES[plan.building].gstin,
        buildingStateCode: building.stateCode,
      }),
      tds: tenantTdsDefaults({ deductsTds: tenant.deductsTds }),
    });
    if (draft) out.set(plan.tenant, draft);
  }
  return out;
}
