// Settings → Tally: the ledger names form. Pure: stored settings in, form
// fields out; the posted form in, settings to store (or errors) out.

import {
  SETTINGS,
  type SettingKey,
  type StoredSettings,
} from "@/lib/settings/schema";

export const LEDGER_FIELDS = [
  ["tally.ledgerRent", "Rent", "Rent lines of invoices and credit notes"],
  ["tally.ledgerMaintenance", "Maintenance (CAM)", "Maintenance lines"],
  [
    "tally.ledgerOtherIncome",
    "Other charges",
    "Parking, utilities, signage and other charges",
  ],
  ["tally.ledgerCgst", "CGST", "CGST on invoices and credit notes"],
  ["tally.ledgerSgst", "SGST", "SGST on invoices and credit notes"],
  ["tally.ledgerIgst", "IGST", "IGST on invoices and credit notes"],
  ["tally.ledgerTds", "TDS", "TDS tenants keep back, on receipts"],
  ["tally.ledgerRoundOff", "Round off", "The invoice round off"],
  ["tally.ledgerBank", "Bank", "Where payments are received"],
] as const satisfies readonly (readonly [SettingKey, string, string])[];

/** The party ledger field of one tenant. */
export const partyField = (tenantId: string) => `party:${tenantId}`;

export function readLedgerForm(
  form: FormData,
  tenantIds: readonly string[],
):
  | {
      organization: StoredSettings;
      parties: Map<string, string>;
    }
  | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const organization: Record<string, string> = {};
  for (const [key, label] of LEDGER_FIELDS) {
    const parsed = SETTINGS[key].schema.safeParse(String(form.get(key) ?? ""));
    if (parsed.success) organization[key] = parsed.data;
    else
      errors[key] =
        `Type the ${label} ledger's name as it is in Tally (up to 100 characters).`;
  }
  const parties = new Map<string, string>();
  for (const id of tenantIds) {
    const name = String(form.get(partyField(id)) ?? "").trim();
    if (name.length > 100) errors[partyField(id)] = "Up to 100 characters.";
    else parties.set(id, name);
  }
  return Object.keys(errors).length > 0
    ? { errors }
    : { organization: organization as StoredSettings, parties };
}
