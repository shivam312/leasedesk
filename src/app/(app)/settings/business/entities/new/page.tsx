import type { Metadata } from "next";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { billingEntityFields } from "@/components/settings/business";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { saveBillingEntity } from "@/server/actions/business";

export const metadata: Metadata = { title: "Add a GSTIN" };

export default function NewBillingEntityPage() {
  return (
    <>
      <PageHeader
        title="Add a GSTIN"
        description="The registration and bank account invoices are issued from."
      />
      <RequirePermission
        permission="manage_settings"
        message="Only an owner can add GSTINs and bank details."
        back={{ href: "/settings/business", label: "Back to Business details" }}
      >
        <SimpleForm
          action={saveBillingEntity.bind(null, null)}
          fields={billingEntityFields()}
          submitLabel="Add GSTIN"
          pendingLabel="Adding…"
        />
      </RequirePermission>
    </>
  );
}
