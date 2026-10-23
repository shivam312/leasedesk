// Field lists for the tenant and contact forms.

import type { FormField } from "@/components/forms/SimpleForm";
import { STATE_OPTIONS } from "@/lib/settings/business-forms";
import { toFieldValue } from "@/lib/settings/rules-form";
import { CONTACT_ROLE_LABELS, TDS_GROUPS } from "@/lib/tenants/forms";

interface TenantValues {
  companyName: string;
  gstin: string | null;
  pan: string | null;
  billingAddress: string;
  stateCode: string;
  deductsTdsRent: boolean;
  tdsRateBpRent: number;
  deductsTdsCam: boolean;
  tdsRateBpCam: number;
  deductsTdsParking: boolean;
  tdsRateBpParking: number;
  deductsTdsOther: boolean;
  tdsRateBpOther: number;
  notes: string | null;
}

const pct = (bp: number) => toFieldValue("gst.defaultRateBp", bp);

/**
 * `reminders`: the business's automatic reminder setting, and this tenant's
 * own if it has one (`reminders.autoSend`).
 */
export function tenantFields(
  t?: TenantValues,
  reminders: { business?: boolean; own?: boolean } = {},
): FormField[] {
  const groups: FormField[] = TDS_GROUPS.flatMap(({ key, label }) => {
    const on = t?.[`deductsTds${key}`];
    const rate = t?.[`tdsRateBp${key}`];
    const same = !t || (on === t.deductsTdsRent && rate === t.tdsRateBpRent);
    return [
      {
        name: `deductsTds${key}`,
        label: `TDS on ${label}`,
        type: "select" as const,
        required: true,
        advanced: true,
        options: [
          { value: "same", label: "Same as rent" },
          { value: "yes", label: "Deducts TDS" },
          { value: "no", label: "No TDS" },
        ],
        defaultValue: same ? "same" : on ? "yes" : "no",
      },
      {
        name: `tdsRate${key}`,
        label: `TDS rate on ${label} (%)`,
        advanced: true,
        inputMode: "decimal" as const,
        defaultValue: same || rate === undefined ? "" : pct(rate),
        hint: "Leave blank for the rent rate.",
      },
    ];
  });
  return [
    {
      name: "companyName",
      label: "Tenant name",
      required: true,
      defaultValue: t?.companyName,
      hint: "As on their invoices, e.g. Acme Software Pvt Ltd.",
    },
    {
      name: "gstin",
      label: "GSTIN",
      defaultValue: t?.gstin ?? "",
      hint: "Leave blank if they aren't registered for GST.",
    },
    {
      name: "pan",
      label: "PAN",
      defaultValue: t?.pan ?? "",
      hint: "Taken from the GSTIN if you leave it blank.",
    },
    {
      name: "billingAddress",
      label: "Billing address",
      type: "textarea",
      required: true,
      defaultValue: t?.billingAddress,
    },
    {
      name: "stateCode",
      label: "State",
      type: "select",
      required: true,
      // No default for a new tenant: the state decides CGST + SGST or IGST.
      options: t
        ? STATE_OPTIONS
        : [{ value: "", label: "Choose a state" }, ...STATE_OPTIONS],
      defaultValue: t?.stateCode ?? "",
    },
    {
      name: "deductsTdsRent",
      label: "Deducts TDS on rent",
      type: "select",
      required: true,
      options: [
        { value: "yes", label: "Yes, they deduct TDS" },
        { value: "no", label: "No" },
      ],
      defaultValue: t ? (t.deductsTdsRent ? "yes" : "no") : "yes",
      hint: "Most companies do. A payment short by the TDS then counts as paid.",
    },
    {
      name: "tdsRateRent",
      label: "TDS rate on rent (%)",
      inputMode: "decimal",
      defaultValue: t ? pct(t.tdsRateBpRent) : "10",
    },
    ...groups,
    {
      name: "remindersAutoSend",
      label: "Payment reminders",
      type: "select",
      advanced: true,
      options: [
        {
          value: "",
          label:
            reminders.business === undefined
              ? "Same as your business"
              : `Same as your business: ${reminders.business ? "send automatically" : "don't send"}`,
        },
        { value: "true", label: "Send automatically" },
        { value: "false", label: "Don't send; I'll remind them myself" },
      ],
      defaultValue: reminders.own === undefined ? "" : String(reminders.own),
      hint: "Emails about unpaid invoices on the days set in Billing rules, in Settings.",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      advanced: true,
      defaultValue: t?.notes ?? "",
    },
  ];
}

export function contactFields(prefix = ""): FormField[] {
  return [
    { name: `${prefix}name`, label: "Contact name", required: true },
    {
      name: `${prefix}role`,
      label: "Role",
      type: "select",
      required: true,
      options: Object.entries(CONTACT_ROLE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      defaultValue: "billing",
    },
    {
      name: `${prefix}email`,
      label: "Email",
      type: "email",
      hint: "Invoices are sent here.",
    },
    { name: `${prefix}phone`, label: "Phone", inputMode: "tel" },
    {
      name: `${prefix}whatsapp`,
      label: "WhatsApp on this number",
      type: "select",
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      defaultValue: "no",
    },
  ];
}
