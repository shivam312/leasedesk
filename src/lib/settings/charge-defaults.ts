// Building defaults for a new lease charge: billing.defaultTiming,
// gst.defaultRateBp and gst.defaultSac (docs/SETTINGS.md, D16).
//
// They are copied onto the charge when the lease is saved, never applied at
// billing time: if a building's default timing changed while a charge was
// being billed, a month would be billed twice (advance → arrears) or not at
// all (arrears → advance). So the engine always receives a charge with its
// own timing, GST rate and SAC code, and changing a building default only
// affects charges added afterwards.

import type { Charge } from "@/lib/billing/types";
import type { Settings } from "./schema";

type Blankable = "timing" | "gstRateBp" | "sacCode";

/** A charge as entered: timing, GST rate and SAC code may be left blank. */
export type ChargeDraft = Charge extends infer C
  ? C extends Charge
    ? Omit<C, Blankable> & Partial<Pick<C, Blankable>>
    : never
  : never;

export type SavedCharge = Charge & Required<Pick<Charge, Blankable>>;

/** The building's defaults, from settings resolved for that building. */
export function chargeDefaults(settings: Settings) {
  return {
    timing: settings["billing.defaultTiming"],
    gstRateBp: settings["gst.defaultRateBp"],
    sacCode: settings["gst.defaultSac"],
  };
}

/**
 * Fill what the user left blank (missing, or an empty SAC) from the building
 * defaults; what they set wins, including 0%.
 */
export function withBuildingDefaults(
  draft: ChargeDraft,
  settings: Settings,
): SavedCharge {
  const defaults = chargeDefaults(settings);
  return {
    ...draft,
    timing: draft.timing ?? defaults.timing,
    gstRateBp: draft.gstRateBp ?? defaults.gstRateBp,
    // A form sends "" for an empty field; that's blank too.
    sacCode: draft.sacCode?.trim() || defaults.sacCode,
  } as SavedCharge;
}
