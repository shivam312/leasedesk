// Field lists for the organization and billing entity forms.

import type { FormField } from "@/components/forms/SimpleForm";
import { STATE_OPTIONS } from "@/lib/settings/business-forms";

type EntityValues = Partial<
  Record<
    | "legalName"
    | "gstin"
    | "stateCode"
    | "address"
    | "bankName"
    | "bankAccountName"
    | "bankAccountNumber"
    | "ifsc"
    | "upiId",
    string | null
  >
>;

export function organizationFields(org: {
  name: string;
  legalName: string | null;
  pan: string | null;
}): FormField[] {
  return [
    {
      name: "name",
      label: "Business name",
      required: true,
      defaultValue: org.name,
      hint: "The name your tenants know you by.",
      autoComplete: "organization",
    },
    {
      name: "legalName",
      label: "Legal name",
      defaultValue: org.legalName ?? "",
      hint: "As on your PAN, if different.",
    },
    { name: "pan", label: "PAN", defaultValue: org.pan ?? "" },
  ];
}

export function billingEntityFields(entity: EntityValues = {}): FormField[] {
  const v = (k: keyof EntityValues) => entity[k] ?? "";
  return [
    {
      name: "legalName",
      label: "Legal name",
      required: true,
      defaultValue: v("legalName"),
      hint: "As on your GST registration; printed on invoices.",
    },
    {
      name: "gstin",
      label: "GSTIN",
      defaultValue: v("gstin"),
      hint: "Leave blank if you aren't registered for GST.",
    },
    {
      name: "stateCode",
      label: "State",
      type: "select",
      required: true,
      defaultValue: v("stateCode") || "27",
      options: STATE_OPTIONS,
    },
    {
      name: "address",
      label: "Address",
      type: "textarea",
      required: true,
      defaultValue: v("address"),
      hint: "Printed on invoices.",
    },
    { name: "bankName", label: "Bank", defaultValue: v("bankName") },
    {
      name: "bankAccountName",
      label: "Account name",
      defaultValue: v("bankAccountName"),
    },
    {
      name: "bankAccountNumber",
      label: "Account number",
      inputMode: "numeric",
      defaultValue: v("bankAccountNumber"),
    },
    { name: "ifsc", label: "IFSC", defaultValue: v("ifsc") },
    {
      name: "upiId",
      label: "UPI ID",
      defaultValue: v("upiId"),
      hint: "For the QR code on invoices, like name@bank.",
    },
  ];
}
