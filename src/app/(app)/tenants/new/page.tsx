import type { Metadata } from "next";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { contactFields, tenantFields } from "@/components/tenants/fields";
import { saveTenant } from "@/server/actions/tenants";

export const metadata: Metadata = { title: "Add tenant" };

export default function NewTenantPage() {
  return (
    <>
      <PageHeader
        title="Add tenant"
        description="Their details for invoices, how they deduct TDS, and who receives invoices."
      />
      <SimpleForm
        action={saveTenant.bind(null, null)}
        fields={[
          ...tenantFields(),
          ...contactFields("contact_").map((f) => ({
            ...f,
            label: f.label.startsWith("Contact")
              ? f.label
              : `Contact ${f.label.toLowerCase()}`,
          })),
        ]}
        submitLabel="Add tenant"
        pendingLabel="Adding…"
      />
    </>
  );
}
