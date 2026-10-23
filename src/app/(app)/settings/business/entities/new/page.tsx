import type { Metadata } from "next";
import { SimpleForm } from "@/components/forms/SimpleForm";
import { billingEntityFields } from "@/components/settings/business";
import { PageHeader } from "@/components/shell/PageHeader";
import { saveBillingEntity } from "@/server/actions/business";

export const metadata: Metadata = { title: "Add a GSTIN" };

export default function NewBillingEntityPage() {
  return (
    <>
      <PageHeader
        title="Add a GSTIN"
        description="The registration and bank account invoices are issued from."
      />
      <SimpleForm
        action={saveBillingEntity.bind(null, null)}
        fields={billingEntityFields()}
        submitLabel="Add GSTIN"
        pendingLabel="Adding…"
      />
    </>
  );
}
