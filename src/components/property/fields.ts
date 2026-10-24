// Field lists for the building, floor and unit forms.

import type { FormField } from "@/components/forms/SimpleForm";
import { hundredthsToSqft, UNIT_STATUS_LABELS } from "@/lib/property/forms";
import { STATE_OPTIONS } from "@/lib/settings/business-forms";

export function buildingFields(
  entities: { id: string; legalName: string; gstin: string | null }[],
  building?: {
    name: string;
    address: string;
    city: string;
    stateCode: string;
    billingEntityId: string;
    invoicePrefix: string;
    creditNotePrefix: string;
  },
): FormField[] {
  return [
    {
      name: "name",
      label: "Building name",
      required: true,
      defaultValue: building?.name,
    },
    {
      name: "address",
      label: "Address",
      type: "textarea",
      required: true,
      defaultValue: building?.address,
    },
    {
      name: "city",
      label: "City",
      required: true,
      defaultValue: building?.city,
    },
    {
      name: "stateCode",
      label: "State",
      type: "select",
      required: true,
      options: STATE_OPTIONS,
      defaultValue: building?.stateCode ?? "27",
      hint: "Decides which GST applies to rent: same state or another state.",
    },
    {
      name: "billingEntityId",
      label: "Bills from",
      type: "select",
      required: true,
      options: entities.map((e) => ({
        value: e.id,
        label: e.gstin ? `${e.legalName} (${e.gstin})` : e.legalName,
      })),
      defaultValue: building?.billingEntityId ?? entities[0]?.id,
    },
    {
      name: "invoicePrefix",
      label: "Invoice number prefix",
      required: true,
      defaultValue: building?.invoicePrefix,
      hint: "Up to 5 letters, usually the building's initials (Orchid Towers → OT): invoices are numbered OT/26-27/0001.",
      advanced: Boolean(building),
    },
    {
      name: "creditNotePrefix",
      label: "Credit note prefix",
      defaultValue: building?.creditNotePrefix,
      hint: "Up to 5 letters. Leave blank for the invoice prefix and CN, like ABCCN.",
      advanced: true,
    },
  ];
}

export function unitFields(
  floorList: { id: string; label: string }[],
  unit?: {
    code: string;
    floorId: string | null;
    carpetArea: number;
    chargeableArea: number;
    status: keyof typeof UNIT_STATUS_LABELS;
  },
): FormField[] {
  return [
    {
      name: "code",
      label: "Unit number",
      required: true,
      defaultValue: unit?.code,
      hint: "Like 301 or Shop 4.",
    },
    {
      name: "floorId",
      label: "Floor",
      type: "select",
      required: true,
      options: [
        { value: "", label: "No floor (small buildings can skip floors)" },
        ...floorList.map((f) => ({ value: f.id, label: f.label })),
      ],
      defaultValue: unit?.floorId ?? floorList[0]?.id ?? "",
    },
    {
      name: "carpetArea",
      label: "Carpet area (sq ft)",
      required: true,
      inputMode: "decimal",
      defaultValue: unit ? hundredthsToSqft(unit.carpetArea) : "",
    },
    {
      name: "chargeableArea",
      label: "Billed area (sq ft)",
      inputMode: "decimal",
      defaultValue: unit ? hundredthsToSqft(unit.chargeableArea) : "",
      hint: "The area rent is charged on. Leave blank if it's the carpet area.",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      defaultValue: unit?.status ?? "vacant",
    },
  ];
}
